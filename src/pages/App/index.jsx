import { createTheme, ThemeProvider, useTheme } from "@material-ui/core";
import { BrowserRouter as Router, Route, Switch } from "react-router-dom";
import Home from "../Home";

const theme = createTheme({
    breakpoints: {
        values: {
            sm: 576,
            md: 768,
            lg: 992
        }
    }
});

const App = () => {
    return (
        <ThemeProvider theme={theme}>
            <Router>
                <Switch>
                    <Route path="/" component={Home} />
                </Switch>
            </Router>
        </ThemeProvider>
    );
};

export default App;