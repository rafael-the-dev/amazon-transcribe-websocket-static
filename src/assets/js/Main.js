export default class Main {
    constructor(startButton, stopButton, errorElement) {
        // dom elements ref
        this.stopButton = stopButton;
        this.startButton = startButton;
        thid.errorElement = errorElement;

        // our converter between binary event streams messages and JSON
        const eventStreamMarshaller = new marshaller.EventStreamMarshaller(util_utf8_node.toUtf8, util_utf8_node.fromUtf8);

        // our global variables for managing state
        this.languageCode = null;
        this.region = null;
        this.sampleRate = null;
        this.inputSampleRate = null;
        this.transcription = "";
        this.socket = null;
        this.micStream = null;
        this.socketError = false;
        this.transcribeException = false;

        if (!window.navigator.mediaDevices.getUserMedia) {
            // Use our helper method to show an error on the page
            this.showError('We support the latest versions of Chrome, Firefox, Safari, and Edge. Update your browser and try your request again.');
        
            // maintain enabled/distabled state for the start and stop buttons
            this.toggleStartStop();
        }
    }

    startButtonClickHanlder() {
        $('#error').hide(); // hide any existing errors
        this.toggleStartStop(true); // disable start and enable stop button
    
        // set the language and region from the dropdowns
        this.setLanguage();
        this.setRegion();
    
        // first we get the microphone input from the browser (as a promise)...
        window.navigator.mediaDevices.getUserMedia({
                video: false,
                audio: true
            })
            // ...then we convert the mic stream to binary event stream messages when the promise resolves 
            .then(streamAudioToWebSocket) 
            .catch(function (error) {
                this.showError('There was an error streaming your audio to Amazon Transcribe. Please try again.');
                this.toggleStartStop();
            });
    }

    streamAudioToWebSocket(userMediaStream) {
        //let's get the mic input from the browser, via the microphone-stream module
        micStream = new mic();
    
        micStream.on("format", function(data) {
            inputSampleRate = data.sampleRate;
        });
    
        micStream.setStream(userMediaStream);
    
        // Pre-signed URLs are a way to authenticate a request (or WebSocket connection, in this case)
        // via Query Parameters. Learn more: https://docs.aws.amazon.com/AmazonS3/latest/API/sigv4-query-string-auth.html
        let url = createPresignedUrl();
    
        //open up our WebSocket connection
        socket = new WebSocket(url);
        socket.binaryType = "arraybuffer";
    
        let sampleRate = 0;
    
        // when we get audio data from the mic, send it to the WebSocket if possible
        socket.onopen = function() {
            micStream.on('data', function(rawAudioChunk) {
                // the audio stream is raw audio bytes. Transcribe expects PCM with additional metadata, encoded as binary
                let binary = convertAudioToBinaryMessage(rawAudioChunk);
    
                if (socket.readyState === socket.OPEN)
                    socket.send(binary);
            }
        )};
    
        // handle messages, errors, and close events
        wireSocketEvents();
    }

    setLanguage() {
        languageCode = $('#language').find(':selected').val();
        if (languageCode == "en-US" || languageCode == "es-US")
            sampleRate = 44100;
        else
            sampleRate = 8000;
    }

    setRegion() {
        region = $('#region').find(':selected').val();
    }

    wireSocketEvents() {
        // handle inbound messages from Amazon Transcribe
        socket.onmessage = function (message) {
            //convert the binary event stream message to JSON
            let messageWrapper = eventStreamMarshaller.unmarshall(Buffer(message.data));
            let messageBody = JSON.parse(String.fromCharCode.apply(String, messageWrapper.body));
            if (messageWrapper.headers[":message-type"].value === "event") {
                handleEventStreamMessage(messageBody);
            }
            else {
                transcribeException = true;
                this.showError(messageBody.Message);
                this.toggleStartStop();
            }
        };
    
        socket.onerror = function () {
            socketError = true;
            this.showError('WebSocket connection error. Try again.');
            this.toggleStartStop();
        };
        
        socket.onclose = function (closeEvent) {
            micStream.stop();
            
            // the close event immediately follows the error event; only handle one.
            if (!socketError && !transcribeException) {
                if (closeEvent.code != 1000) {
                    this.showError('</i><strong>Streaming Exception</strong><br>' + closeEvent.reason);
                }
                this.toggleStartStop();
            }
        };
    }

    handleEventStreamMessage(messageJson) {
        let results = messageJson.Transcript.Results;
    
        if (results.length > 0) {
            if (results[0].Alternatives.length > 0) {
                let transcript = results[0].Alternatives[0].Transcript;
    
                // fix encoding for accented characters
                transcript = decodeURIComponent(escape(transcript));
    
                // update the textarea with the latest result
                $('#transcript').val(transcription + transcript + "\n");
    
                // if this transcript segment is final, add it to the overall transcription
                if (!results[0].IsPartial) {
                    //scroll the textarea down
                    $('#transcript').scrollTop($('#transcript')[0].scrollHeight);
    
                    transcription += transcript + "\n";
                }
            }
        }
    }

    closeSocket () {
        if (socket.readyState === socket.OPEN) {
            micStream.stop();
    
            // Send an empty frame so that Transcribe initiates a closure of the WebSocket after submitting all transcripts
            let emptyMessage = getAudioEventMessage(Buffer.from(new Buffer([])));
            let emptyBuffer = eventStreamMarshaller.marshall(emptyMessage);
            socket.send(emptyBuffer);
        }
    }

    toggleStartStop(disableStart = false) {
        $('#start-button').prop('disabled', disableStart);
        $('#stop-button').attr("disabled", !disableStart);
    }
    
    showError(message) {
        $('#error').html('<i class="fa fa-times-circle"></i> ' + message);
        $('#error').show();
    }

    convertAudioToBinaryMessage(audioChunk) {
        let raw = mic.toRaw(audioChunk);
    
        if (raw == null)
            return;
    
        // downsample and convert the raw audio bytes to PCM
        let downsampledBuffer = audioUtils.downsampleBuffer(raw, inputSampleRate, sampleRate);
        let pcmEncodedBuffer = audioUtils.pcmEncode(downsampledBuffer);
    
        // add the right JSON headers and structure to the message
        let audioEventMessage = getAudioEventMessage(Buffer.from(pcmEncodedBuffer));
    
        //convert the JSON object + headers into a binary event stream message
        let binary = eventStreamMarshaller.marshall(audioEventMessage);
    
        return binary;
    }

    getAudioEventMessage(buffer) {
        // wrap the audio data in a JSON envelope
        return {
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
        };
    }

    createPresignedUrl() {
        let endpoint = "transcribestreaming." + region + ".amazonaws.com:8443";
    
        // get a preauthenticated URL that we can use to establish our WebSocket
        return v4.createPresignedURL(
            'GET',
            endpoint,
            '/stream-transcription-websocket',
            'transcribe',
            crypto.createHash('sha256').update('', 'utf8').digest('hex'), {
                'key': $('#access_id').val(),
                'secret': $('#secret_key').val(),
                'sessionToken': $('#session_token').val(),
                'protocol': 'wss',
                'expires': 15,
                'region': region,
                'query': "language-code=" + languageCode + "&media-encoding=pcm&sample-rate=" + sampleRate
            }
        );
    }
}