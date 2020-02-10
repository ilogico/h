# @ilogico/h

Pet project for a Reactish API.
It's not nearly production ready or feature complete and will probably never will.
The purpose is to educate myself more than anything else.

## What seems to work (it's not thoroughly tested yet :)
- functional components (no Component, no PureComponent)
- context API (only Context.Provider, no Context.Consumer)
- hooks: `useState`, `useMemo`, `useEffect`, `useLayoutEffect` and `useContext`

## What's missing
- better typings
- keys (only the order and types of elements matter)
- better handling of host (HTML) components (currently all props are assigned to the DOM element, requires `onclick` for event handlers, for eg.)
- handling of SVG elements
- decent support for custom elements

## Fun facts
### `useEffect` vs `useLayoutEffect`
- to see the difference between the two, we need to use an `alert` in the effect and use Chromium
- Firefox always repaint
- if we use a break point, the browser both Chromium and Firefox repaing
- `Promise.resolve().then` is not enough for Chromium to repaint, we must use `requestAnimationFrame`
