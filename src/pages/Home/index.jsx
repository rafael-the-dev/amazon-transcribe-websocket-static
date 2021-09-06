import { Button, ButtonGroup, Grid, MenuItem, TextField, Typography, Paper } from "@material-ui/core";
import amazonLogo from '../../assets/images/AWS_logo_RGB.png'
import { useEffect, useState, useRef, useCallback } from "react";
import { useClasses } from "./styles";
import classNames from "classnames";
import poolId from '../../private/poolID.json';


const audioUtils        = require('./js/audioUtils');  // for encoding audio data as PCM
const crypto            = require('crypto'); // tot sign our pre-signed URL
const v4                = require('./js/aws-signature-v4'); // to generate our pre-signed URL
const marshaller        = require("@aws-sdk/eventstream-marshaller"); // for converting binary event stream messages to and from JSON
const util_utf8_node    = require("@aws-sdk/util-utf8-node"); // utilities for encoding and decoding UTF8
const mic               = require('microphone-stream'); // collect microphone input as a stream of raw bytes
const AWS               = require('aws-sdk');

const Home = () => {
    const classes = useClasses();

    const [ isStarted, setIsStarted ] = useState(false);
    const [ hasError, setHasError ] = useState(false);
    const [ message, setMessage ] = useState("");
    const [ language, setLanguage ] = useState('en-US');
    const [ region, setRegion ] = useState("us-east-1");
    const [ accessID, setAccessID ] = useState("");
    const [ secretKey, setSecretKey ] = useState("");
    const [ sessionToken, setSessionToken ] = useState("");

    const sampleRate = useRef(44100);
    const inputSampleRate = useRef(null);
    const transcription  = useRef("");;
    const socket = useRef(null);
    const micStream = useRef(null);
    const socketError = useRef(false);
    const transcribeException = useRef(false);

    // our converter between binary event streams messages and JSON
    const eventStreamMarshaller = useRef(null);

    const transcriptRef = useRef(null);

    const languages = useRef([
        {
            label: 'US English (en-US)',
            value: 'en-US'
        },
        {
            label: 'Australian English (en-AU)',
            value: '"en-AU'
        },
        {
            label: 'British English (en-GB)',
            value: 'en-GB'
        },
        {
            label: 'Canadian French (fr-CA)',
            value: 'fr-CA'
        },
        {
            label: 'French (fr-FR)',
            value: 'fr-FR'
        },
        {
            label: 'US Spanish (es-US)',
            value: 'es-US'
        }
    ]);

    const regions = useRef([
        {
            label: 'US East (N. Virginia)',
            value: 'us-east-1'
        },
        {
            label: 'US East (Ohio)',
            value: 'us-east-2'
        },
        {
            label: 'US West (Oregon)',
            value: 'us-west-2'
        },
        {
            label: 'Asia Pacific (Sydney)',
            value: 'ap-southeast-2'
        },
        {
            label: 'Canada (Central)',
            value: 'ca-central-1'
        },
        {
            label: 'EU (Ireland)',
            value: 'eu-west-1'
        }
    ]);

    
    const streamAudioToWebSocket = userMediaStream => {
        //let's get the mic input from the browser, via the microphone-stream module
        micStream.current = new mic();
    
        micStream.current.on("format", function(data) {
            inputSampleRate.current = data.sampleRate;
        });
    
        micStream.current.setStream(userMediaStream);
    
        // Pre-signed URLs are a way to authenticate a request (or WebSocket connection, in this case)
        // via Query Parameters. Learn more: https://docs.aws.amazon.com/AmazonS3/latest/API/sigv4-query-string-auth.html
        let url = createPresignedUrl();
    
        //open up our WebSocket connection
        socket.current = new WebSocket(url);
        socket.current.binaryType = "arraybuffer";
    
        //let sampleRate = 0;
    
        // when we get audio data from the mic, send it to the WebSocket if possible
        socket.current.onopen = function() {
            micStream.current.on('data', function(rawAudioChunk) {
                // the audio stream is raw audio bytes. Transcribe expects PCM with additional metadata, encoded as binary
                let binary = convertAudioToBinaryMessage(rawAudioChunk);
    
                if (socket.current.readyState === socket.current.OPEN)
                    socket.current.send(binary);
            }
        )};
    
        // handle messages, errors, and close events
        wireSocketEvents();
    };

    const wireSocketEvents = () => {
        // handle inbound messages from Amazon Transcribe
        socket.current.onmessage = function (message) {
            //convert the binary event stream message to JSON
            let messageWrapper = eventStreamMarshaller.current.unmarshall(Buffer(message.data));
            let messageBody = JSON.parse(String.fromCharCode.apply(String, messageWrapper.body));
            if (messageWrapper.headers[":message-type"].value === "event") {
                handleEventStreamMessage(messageBody);
            }
            else {
                transcribeException.current = true;
                showError(messageBody.Message);
                toggleStartStop();
            }
        };

        socket.current.onerror = function () {
            socketError.current = true;
            showError('WebSocket connection error. Try again.');
            toggleStartStop();
        };
        
        socket.current.onclose = function (closeEvent) {
            micStream.current.stop();
            
            // the close event immediately follows the error event; only handle one.
            if (!socketError.current && !transcribeException.current) {
                if (closeEvent.code !== 1000) {
                    showError(<><i><strong>Streaming Exception</strong><br/> {closeEvent.reason}</i></>);
                }
                toggleStartStop();
            }
        };
    };

    const handleEventStreamMessage = messageJson => {
        let results = messageJson.Transcript.Results;
    
        if (results.length > 0) {
            if (results[0].Alternatives.length > 0) {
                let transcript = results[0].Alternatives[0].Transcript;
    
                // fix encoding for accented characters
                transcript = decodeURIComponent(escape(transcript));
    
                // update the textarea with the latest result
                transcriptRef.current.value = transcription.current + transcript + "\n";
    
                // if this transcript segment is final, add it to the overall transcription
                if (!results[0].IsPartial) {
                    //scroll the textarea down
                    transcriptRef.current.scrollTop = transcriptRef.current.scrollHeight;
    
                    transcription.current += transcript + "\n";
                }
            }
        }
    };

    let closeSocket = function () {
        if (socket.current.readyState === socket.current.OPEN) {
            micStream.current.stop();
    
            // Send an empty frame so that Transcribe initiates a closure of the WebSocket after submitting all transcripts
            let emptyMessage = getAudioEventMessage(Buffer.from(new Buffer([])));
            let emptyBuffer = eventStreamMarshaller.current.marshall(emptyMessage);
            socket.current.send(emptyBuffer);
        }
    };

    const convertAudioToBinaryMessage = audioChunk =>{ //
        let raw = mic.toRaw(audioChunk);
    
        if (raw == null)
            return;
    
        // downsample and convert the raw audio bytes to PCM
        let downsampledBuffer = audioUtils.downsampleBuffer(raw, inputSampleRate.current, sampleRate);
        let pcmEncodedBuffer = audioUtils.pcmEncode(downsampledBuffer);
    
        // add the right JSON headers and structure to the message
        let audioEventMessage = getAudioEventMessage(Buffer.from(pcmEncodedBuffer));
    
        //convert the JSON object + headers into a binary event stream message
        let binary = eventStreamMarshaller.current.marshall(audioEventMessage);
    
        return binary;
    };
    
    // wrap the audio data in a JSON envelope
    const getAudioEventMessage = buffer => (
        {
            headers: {
                ':message-type': {
                    type: 'string',
                    value: 'event'
                },
                ':event-type': {
                    type: 'string',
                    value: 'AudioEvent'
                }
            },
            body: buffer
        }
    );

    const createPresignedUrl = () => {
        let endpoint = `transcribestreaming.${region}.amazonaws.com:8443`;
    
        // get a preauthenticated URL that we can use to establish our WebSocket
        return v4.createPresignedURL(
            'GET',
            endpoint,
            '/stream-transcription-websocket',
            'transcribe',
            crypto.createHash('sha256').update('', 'utf8').digest('hex'), {
                'key': accessID,
                'secret': secretKey,
                'sessionToken': sessionToken,
                'protocol': 'wss',
                'expires': 15,
                'region': region,
                'query': "language-code=" + language + "&media-encoding=pcm&sample-rate=" + sampleRate.current
            }
        );
    }

    const startButtonClickHandler =  () => {
        setHasError(false) // hide any existing errors
        toggleStartStop(true); // disable start and enable stop button

        // first we get the microphone input from the browser (as a promise)...
        window.navigator.mediaDevices.getUserMedia({
                video: false,
                audio: true
            })
            // ...then we convert the mic stream to binary event stream messages when the promise resolves 
            .then(streamAudioToWebSocket) 
            .catch(error => {
                showError('There was an error streaming your audio to Amazon Transcribe. Please try again.');
                toggleStartStop();
                console.error(error)
            }
        );
    };

    const stopButtonClickHandler = () => {
        closeSocket();
        toggleStartStop();
    };

    const resetButtonClickHandler = () => {
        transcriptRef.current.value = '';
        transcription.current = '';
        
        setAccessID("");
        setSecretKey("");
        setSessionToken("");
    };

    const toggleStartStop = (disableStart = false) => {
        setIsStarted(disableStart)
    };

    const showError = message => {
        setMessage(message)
        setHasError(true);
    };

    const handleLanguageChange = event => {
        let languageCode = event.target.value;

        if (languageCode === "en-US" || languageCode === "es-US")
            sampleRate.current = 44100;
        else
            sampleRate.current = 8000;

        setLanguage(languageCode);
    };

    const defaultOnChangleHandler = func => event => func(event.target.value);

    const setCredentials = useCallback(() => {
        // Gets the existing credentials, refreshing them if they are not yet loaded
        AWS.config.credentials.get(function(err) {
            if (err) console.error(err);
            else {
                const { AccessKeyId, SecretKey, SessionToken } = AWS.config.credentials.data.Credentials;
                setSecretKey(SecretKey);
                setAccessID(AccessKeyId);
                setSessionToken(SessionToken);
            }
        });
    }, [ ]);

    const createCredentials = useCallback(async () => { 
        // create new credentials
        AWS.config.credentials = new AWS.CognitoIdentityCredentials({
            IdentityPoolId: poolId.identityPoolId 
        }, { region: poolId.region });

        setCredentials()
    }, [ setCredentials ]);

    const refreshCredentials = useCallback(async () => {
        await AWS.config.credentials.refreshPromise();
        setCredentials();

        // schedule the next credential refresh when they're about to expire
        setTimeout(refreshCredentials, AWS.config.credentials.expireTime - new Date());
    }, [ setCredentials ]);

    useEffect(() => {
        eventStreamMarshaller.current = new marshaller.EventStreamMarshaller(util_utf8_node.toUtf8, util_utf8_node.fromUtf8);
        if (!window.navigator.mediaDevices.getUserMedia) {
            // Use our helper method to show an error on the page
            showError('We support the latest versions of Chrome, Firefox, Safari, and Edge. Update your browser and try your request again.');
        
            // maintain enabled/distabled state for the start and stop buttons
            toggleStartStop();
        }
    }, [ ]);

    useEffect(() => {
        createCredentials()
        refreshCredentials();
    }, [ createCredentials, refreshCredentials ]);


    return (
        <>
            <Grid container component="header" className={classNames(classes.header)}>
                <Paper elevation={0} className={classNames(classes.headerPaper)}>
                    <Typography component="h1" variant="h5" className={classNames(classes.headerTitle)}>
                        Real-time Audio Transcription
                    </Typography>
                    <Typography component="p" variant="body2" className={classNames(classes.headerDescription)}>
                        Using the <a href="https://aws.amazon.com/transcribe/">Amazon Transcribe</a> WebSocket API
                    </Typography>
                </Paper>
            </Grid>
            <Grid container component="main" className={classNames(classes.main)}>
                <Typography component="h2" className={classNames(classes.subTitle)}>
                    Create an <a href="https://aws.amazon.com/free/">AWS Account</a>, attach the necessary <a
                    href="policy.json"> IAM policy</a>, and enter your Access Id and Secret Key below.
                </Typography>

                <Grid 
                    item 
                    xs={12} 
                    id="error" 
                    className={classNames(classes.error, classes.isaError, { [classes.errorDisplay]: hasError })}>
                    <i className="fa fa-times-circle"></i>
                    <Typography component="p" variant="body2" className={classNames(classes.errorMessage)}>
                        { message }
                    </Typography>
                </Grid>

                <Grid item container component="form" xs={12} className={classNames(classes.form)}>
                    <TextField 
                        fullWidth 
                        label="Access ID" 
                        variant="outlined" 
                        className={classNames(classes.formInputContainer)} 
                        value={accessID}
                        onChange={defaultOnChangleHandler(setAccessID)}
                    />
                    <TextField 
                        fullWidth 
                        label="Secret Key" 
                        variant="outlined" 
                        className={classNames(classes.formInputContainer)} 
                        value={secretKey}
                        onChange={defaultOnChangleHandler(setSecretKey)}
                    />
                    <TextField 
                        fullWidth 
                        label="Session Token (if using MFA)" 
                        variant="outlined" 
                        className={classNames(classes.formInputContainer)} 
                        value={sessionToken}
                        onChange={defaultOnChangleHandler(setSessionToken)}
                    />
                    <TextField
                        select
                        fullWidth
                        label="Language"
                        value={language}
                        onChange={handleLanguageChange}
                        helperText="Please select your language"
                        variant="outlined"
                        className={classNames(classes.formInputContainer)}
                        >
                        {languages.current?.map((option) => (
                            <MenuItem key={option.value} value={option.value}>
                                {option.label}
                            </MenuItem>
                        ))}
                    </TextField>
                    <TextField
                        select
                        fullWidth
                        label="Region"
                        value={region}
                        onChange={defaultOnChangleHandler(setRegion)}
                        helperText="Please select your region"
                        variant="outlined"
                        className={classNames(classes.formInputContainer)}
                        >
                        {regions.current?.map((option) => (
                            <MenuItem key={option.value} value={option.value}>
                                {option.label}
                            </MenuItem>
                        ))}
                    </TextField>
                    <TextField 
                        ref={transcriptRef}
                        fullWidth 
                        multiline 
                        minRows={4} 
                        variant="outlined" 
                        inputProps={{ readOnly: true }}
                        placeholder="Press Start and speak into your mic"
                    />
                    <ButtonGroup color="primary" className={classNames(classes.formButtonsGroup)}>
                        <Button 
                            disabled={isStarted}
                            className={classNames(classes.formButton)}
                            onClick={startButtonClickHandler}>
                            <i className={classNames('fa fa-microphone', classes.fa)}></i> Start
                        </Button>
                        <Button 
                             disabled={!isStarted}
                            className={classNames(classes.formButton)}
                            onClick={stopButtonClickHandler}>
                            <i className={classNames('fa fa-stop-circle', classes.fa)}></i> Stop
                        </Button>
                        <Button 
                            type="reset"
                            className={classNames(classes.formButton)}
                            onClick={resetButtonClickHandler}>
                                Clear Transcript
                            </Button>
                    </ButtonGroup>
                </Grid>
                <Grid item xs={12} className="col">
                    <a className={classNames(classes.amazonLogoContainer)} href="https://aws.amazon.com/free/" aria-label="Amazon Web Services">
                        <img id="logo" src={amazonLogo} alt="AWS" className={classNames(classes.amazonLogo)} />
                    </a> 
                </Grid>
            </Grid>
            <a href="https://github.com/aws-samples/amazon-transcribe-websocket-static" aria-label="View source on GitHub">
                <svg id="github" className={classes.github} width="80" height="80" viewBox="0 0 250 250" aria-hidden="true">
                    <path d="M0,0 L115,115 L130,115 L142,142 L250,250 L250,0 Z"></path>
                    <path
                        d="M128.3,109.0 C113.8,99.7 119.0,89.6 119.0,89.6 C122.0,82.7 120.5,78.6 120.5,78.6 C119.2,72.0 123.4,76.3 123.4,76.3 C127.3,80.9 125.5,87.3 125.5,87.3 C122.9,97.6 130.6,101.9 134.4,103.2"
                        fill="currentColor" style={{transformOrigin: '130px 106px'}} className="octo-arm"></path>
                    <path
                        d="M115.0,115.0 C114.9,115.1 118.7,116.5 119.8,115.4 L133.7,101.6 C136.9,99.2 139.9,98.4 142.2,98.6 C133.8,88.0 127.5,74.4 143.8,58.0 C148.5,53.4 154.0,51.2 159.7,51.0 C160.3,49.4 163.2,43.6 171.4,40.1 C171.4,40.1 176.1,42.5 178.8,56.2 C183.1,58.6 187.2,61.8 190.9,65.4 C194.5,69.0 197.7,73.2 200.1,77.6 C213.8,80.2 216.3,84.9 216.3,84.9 C212.7,93.1 206.9,96.0 205.4,96.6 C205.1,102.4 203.0,107.8 198.3,112.5 C181.9,128.9 168.3,122.5 157.7,114.1 C157.9,116.9 156.7,120.9 152.7,124.9 L141.0,136.5 C139.8,137.7 141.6,141.9 141.8,141.8 Z"
                        fill="currentColor" className="octo-body"></path>
                </svg>
            </a>
        </>
    );
};

export default Home;