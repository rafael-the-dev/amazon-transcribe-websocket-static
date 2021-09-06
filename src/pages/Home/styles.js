import { makeStyles } from "@material-ui/core";

export const useClasses = makeStyles(theme => ({
    px: {
        paddingLeft: '5%',
        paddingRight: '5%'
    },
    header: {
        borderBottom: '1px solid #ccc',
        paddingBottom: '1.3rem',
        paddingTop: '1.3rem',
        position: 'relative'
    },
    headerPaper: {
        backgroundColor: 'transparent'
    },
    headerTitle: {
        fontWeight: 700,
        width: '70%'
    },
    headerDescription: {
        marginTop: '1.5rem'
    },
    main: {
        paddingBottom: '1.3rem',
        paddingTop: '1.5rem',
        [theme.breakpoints.up('lg')]: {
            paddingBottom: '3rem',
            paddingTop: '3rem'
        }
    },
    subTitle: {
        fontSize: '1.13rem',
        fontWeight: 400,
        lineHeight: 1.6
    },
    error: {
        backgroundColor: '#FFD2D2',
        borderRadius: 5,
        color: '#D8000C',
        display: 'none',
        fontSize: '1.5em',
        padding: '1.4rem 24px',
        marginBottom: '1.4rem',
        marginTop: '2rem'
    },
    errorDisplay: {
        display: 'block !important'
    },
    errorMessage: {
        lineHeight: '1.6rem',
        marginTop: '1rem'
    },
    form: {
        marginTop: '2rem',
        '& .MuiInputBase-input': {
            fontSize: '.9rem !Important',
            textOverflow: 'ellipsis'
        }
    },
    formInputContainer: {
        marginBottom: '1rem'
    },
    formButtonsGroup: {
        alignItems: 'center',
        display: 'flex',
        flexFlow: 'row wrap',
        justifyContent: 'space-around',
        marginTop: '1rem',
        width: '100%',
        [theme.breakpoints.up('sm')]: {
            justifyContent: 'space-between',
        },
        [theme.breakpoints.up('lg')]: {
            marginTop: '2rem'
        }
    },
    formButton: {
        border: '1px solid #ccc !important',
        borderRadius: 0,
        fontSize: '.8rem',
        marginBottom: 13,
        padding: '8px 7px',
        width: '48%',
        [theme.breakpoints.up('sm')]: {
            marginBottom: 0,
            width: '31%'
        }
    },
    fa: {
        marginRight: 10
    },
    amazonLogoContainer: {
        display: 'block',
        height: 50,
        margin: '1.5rem auto 0 auto',
        width: 74,
        [theme.breakpoints.up('sm')]: {
            marginTop: '2rem'
        },
        [theme.breakpoints.up('lg')]: {
            marginTop: '3rem'
        }
    },
    amazonLogo: {
        display: 'block',
        height: '100%',
        width: '100%'
    },
    github: {
        fill: '#146eb4',
        color: '#fff',
        position: 'absolute',
        top: 0,
        border: 0,
        right: 0,
        [theme.breakpoints.up('sm')]: {
            right: '10%'
        },
        [theme.breakpoints.up('lg')]: {
            right: '15%'
        },
        [theme.breakpoints.up(1400)]: {
            right: '20%'
        }
    }
}));
