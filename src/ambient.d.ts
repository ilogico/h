declare namespace JSX {
    type Element = import('./h').NodeConfig;
    export interface IntrinsicElements {
        div: any;
        button: any;
        span: any;
        input: any;
        form: any;
    }
}
