import { createContext, Fragment, h, mount, useCallback, useContext, useLayoutEffect, useState } from './h.js';

function App() {
    const [counter, setCounter] = useState(0);

    return (
        <Fragment>
            <button onclick={() => setCounter(c => c + 1)} >Click me</button>
            <div>Count {counter}</div>
            {counter % 2 === 0 ? 'cenas' : <span>ultras</span>}
            {counter % 10 === 0 ? <RoundNumber /> : <ClickCounter />}
            <Controls />
            <DisplayValue />
            <Form />
        </Fragment>
    );
}

function RoundNumber() {
    const [value, setValue] = useState(0);

    useLayoutEffect(
        () => {
            if (value < 5) {
                // alert(value);
                setValue(value + 1);
            }
        },
        [value],
    );

    return <div>Hit a round number! <span>{value}</span></div>;
}

function ClickCounter() {
    const [clicks, setClicks] = useState(0);
    const increment = useCallback(
        () => setClicks(clicks => clicks + 1),
        [],
    );

    return (
        <div>
            <button onclick={increment}>{clicks}</button>
        </div>
    )

}

const CenasContext = createContext({ value: 42, increment: () => { }, decrement: () => { } });

function CenasController() {
    const [value, setValue] = useState(21);
    const increment = useCallback(() => setValue(value => value + 1), []);
    const decrement = useCallback(() => setValue(value => value - 1), []);

    return (
        <CenasContext.Provider value={{ value, increment, decrement }}>
            <App />
        </CenasContext.Provider>
    );
}

function Controls() {
    const cenas = useContext(CenasContext);

    return (
        <div>
            <button onclick={cenas.decrement}>-</button>
            <button onclick={cenas.increment}>+</button>
        </div>
    );
}

function DisplayValue() {
    return useContext(CenasContext).value;
}

mount(
    <CenasController />,
    document.getElementById('app-root'),
);

function Form() {
    const [value, setValue] = useState('');
    const handleInput = useCallback(
        (event: any) => setValue(event.target.value),
        [],
    );
    return (
        <form>
            <input value={value} oninput={handleInput} />
            <div>{value}</div>
            <button type="reset">reset</button>
        </form>
    );
}
