import { createContext, Fragment, h, mount, useCallback, useContext, useEffect, useState } from './h.js';

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
        </Fragment>
    );
}

function RoundNumber() {
    useEffect(
        () => {
            console.log('mounting RoundNumber');
            return () => console.log('unmounting RoundNumber');
        }
    );

    useEffect(() => { })
    return <div>Hit a round number!</div>;
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
        <CenasContext.Provider value={{ value, increment, decrement}}>
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
