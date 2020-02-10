const enum NodeType {
    Null,
    Text,
    Element,
    Fragment,
    Component,
    Provider,
}

interface ElementConfig {
    type: string;
    props: any;
}

interface ComponentConfig {
    type: (props: any) => any;
    props: any;
}

type TextConfig = string | number | bigint;

type NullConfig = null | undefined | boolean;

interface ProviderConfig {
    type: Provider;
    props: { value: any, children: NodeConfig[] };
};

export type NodeConfig =
    | ElementConfig
    | ComponentConfig
    | TextConfig
    | NullConfig
    | NodeConfig[]
    | ProviderConfig
    ;

interface BaseVNode {
    readonly type: NodeType;
    getNodeForInsertion(): Node;
    getFirstNode(): Node;
    getLastNode(): Node;
    unmount(): void;
    replaceWith(vnode: Node): void;
}

abstract class SingleNodeVNode implements BaseVNode {
    abstract readonly type: NodeType;
    abstract readonly node: ChildNode;

    getNodeForInsertion() {
        return this.node;
    }

    getFirstNode(): Node {
        return this.node;
    }

    getLastNode(): Node {
        return this.node;
    }

    unmount() {
        this.node.remove();
    }

    replaceWith(node: Node) {
        this.node.replaceWith(node);
    }
}

class NullNode extends SingleNodeVNode {
    readonly type = NodeType.Null;
    readonly node = new Comment();
}

class TextNode extends SingleNodeVNode {
    readonly type = NodeType.Text;
    config: TextConfig;
    readonly node: Text;

    constructor(config: TextConfig) {
        super();
        this.config = config;
        this.node = new Text(String(config));
    }

    update(config: TextConfig) {
        if (config !== this.config) {
            this.config = config;
            this.node.nodeValue = String(config);
        }
    }
}

function getAttributes(props: any): [string, any][] | undefined {
    if (!props) return undefined;
    const attributes = Object.entries(props).filter(([, value]) => value !== undefined).sort(compareAttributes);
    return attributes.length > 0 ? attributes : undefined;
}

class ElementNode extends SingleNodeVNode {
    readonly type = NodeType.Element;
    config: ElementConfig;
    attributes: [string, any][] | undefined;
    readonly node: Element;
    children: VNode[] | undefined;

    constructor(config: ElementConfig, context: NodeContext) {
        super();
        const { type, props } = config;

        const node = document.createElement(type);
        this.config = config;
        this.node = node;
        this.addAllAttributes(props, context);
    }

    getNodeForInsertion() {
        return this.node;
    }

    replaceWith(node: Node) {
        this.children?.forEach(c => c.unmount());
        super.replaceWith(node);
    }

    update(config: ElementConfig, context: NodeContext) {
        const { props } = config;
        if (props === this.config.props)
            return;

        this.config = config;
        const oldAttributes = this.attributes;
        const newAttributes = getAttributes(props);
        if (!newAttributes) {
            this.removeAllAttributes();
        } else if (!oldAttributes) {
            this.addAllAttributes(props, context);
        } else {
            let o = 0, n = 0;

            while (o < oldAttributes.length && n < newAttributes.length) {
                const [oldName, oldValue] = oldAttributes[o];
                const [newName, newValue] = newAttributes[n];
                if (oldName < newName) {
                    this.removeAttribute(oldName, oldValue);
                    o++;
                } else if (oldName > newName) {
                    this.addAttribute(newName, newValue, context);
                    n++;
                } else {
                    if (oldValue !== newValue) this.updateAttribute(newName, oldValue, newValue, context);
                    o++;
                    n++;
                }
            }

            for (; o < oldAttributes.length; o++) {
                this.removeAttribute(oldAttributes[o][0], oldAttributes[o][1]);
            }

            for (; n < newAttributes.length; n++) {
                const [name, value] = newAttributes[n];
                this.addAttribute(name, value, context);
            }
        }
    }

    private addAttribute(name: string, value: any, context: NodeContext) {
        const { node } = this;
        if (name === 'children') {
            const children = createChildNodes(value as NodeConfig[], context);
            children?.forEach(c => node.appendChild(c.getNodeForInsertion()));
            this.children = children;
        } else if (name === 'ref') {
            if (typeof value === 'function') {
                value(node);
            } else {
                value.current = node;
            }
        } else {
            /// @ts-ignore
            node[name] = value;
        }
    }

    private addAllAttributes(props: any, context: NodeContext) {
        const attributes = getAttributes(props);
        this.attributes = attributes;
        attributes?.forEach(([name, value]) => this.addAttribute(name, value, context));
    }

    private removeAttribute(name: string, oldValue: any) {
        if (name === 'children') {
            const { children } = this;
            if (!children) return;

            this.children = undefined;
            children.forEach(c => c.unmount());
        } else if (name === 'ref') {
            if (typeof oldValue === 'function') {
                oldValue(null);
            } else {
                oldValue.current = null;
            }
        } else {
            /// @ts-ignore
            node[name] = null;
        }
    }

    private removeAllAttributes() {
        const { attributes } = this;
        if (!attributes) return;

        this.attributes = undefined;
        attributes.forEach(([name, value]) => this.removeAttribute(name, value));
    }

    private updateAttribute(name: string, oldValue: any, newValue: any, context: NodeContext) {
        const { node } = this;
        if (name === 'children') {
            const configs: NodeConfig[] = newValue ?? [];
            const children = this.children ?? [];
            let i = 0;
            for (; i < children.length && i < configs.length; i++) {
                children[i] = updateVNode(children[i], configs[i], context);
            }
            while (i < children.length) {
                children.pop()!.unmount();
            }
            for (; i < configs.length; i++) {
                const child = createVNode(configs[i], context);
                this.node.appendChild(child.getNodeForInsertion());
                children.push(child);
            }
            this.children = children.length > 0 ? children : undefined;
        } else if (name === 'ref') {
            this.removeAttribute('ref', oldValue);
            this.addAttribute('ref', newValue, context);

        } else {
            /// @ts-ignore
            node[name] = newValue;
        }
    }
}

class FragmentNode implements BaseVNode {
    readonly type = NodeType.Fragment;
    config: NodeConfig[];
    node: Comment | undefined;
    children: VNode[] | undefined;

    constructor(config: NodeConfig[], context: NodeContext) {
        const children = config.length > 0 ? createChildNodes(config, context) : undefined;
        this.config = config;
        this.children = children;
        this.node = children ? undefined : new Comment();
    }

    getNodeForInsertion() {
        let node = this.node as Node;
        if (!node) {
            node = new DocumentFragment();
            const children = this.children!;
            for (let i = 0, n = children.length; i < n; i++) {
                node.appendChild(children[i].getNodeForInsertion());
            }
        }
        return node;
    }

    getFirstNode(): Node {
        return this.node || this.children![0].getFirstNode();
    }

    getLastNode(): Node {
        return this.node || this.children![this.children!.length - 1].getLastNode();
    }

    unmount() {
        if (this.node) {
            this.node.remove();
        } else {
            this.children!.forEach(child => child.unmount());
        }
    }

    replaceWith(replacement: Node) {
        const { node } = this;
        if (node) {
            node.replaceWith(replacement);
        } else {
            const children = this.children!;
            children[0].replaceWith(replacement);
            for (let i = 1; i < children.length; i++) {
                children[i].unmount();
            }
        }
    }

    update(configs: NodeConfig[], context: NodeContext) {
        const { children } = this;
        if (children && configs.length > 0) {
            if (configs.length > 0) {
                let i = 0;
                for (; i < children.length && i < configs.length; i++) {
                    children[i] = updateVNode(children[i], configs[i], context);
                }
                while (i < children.length) {
                    children.pop()!.unmount();
                }

                for (; i < configs.length; i++) {
                    const lastNode = this.getLastNode();
                    const child = createVNode(configs[i], context);
                    const { parentNode, nextSibling } = lastNode;
                    if (nextSibling) parentNode?.insertBefore(child.getNodeForInsertion(), nextSibling);
                    else parentNode?.appendChild(child.getNodeForInsertion());
                    children.push(child);
                }
            } else {
                const node = new Comment();
                children[0].replaceWith(node);
                for (let i = 1; i < children.length; i++) {
                    children[i].unmount();
                }
                this.children = undefined;
                this.node = node;
            }
        } else {
            const node = this.node!;
            if (configs.length > 0) {
                const children = createChildNodes(configs, context)!;
                const { parentNode } = node;
                if (parentNode) children.forEach(c => parentNode.insertBefore(c.getNodeForInsertion(), node));
                node.remove();
                this.node = undefined;
                this.children = children;
            }
        }
    }
}

interface NodeContext {
    depth: number;
    providers: Record<string, ProviderNode>;
}

class ComponentNode implements BaseVNode {
    readonly type = NodeType.Component;
    config: ComponentConfig;
    state: State | undefined;
    child: VNode;
    depth: number;
    providers: Record<string, ProviderNode>;
    dirty = false;
    mounted = true;

    constructor(config: ComponentConfig, { depth, providers }: NodeContext) {
        this.config = config;
        this.state = undefined;
        this.depth = depth;
        this.providers = providers;
        try {
            const { type, props } = config;
            hooks = new CreationHooks(this);
            this.child = createVNode(type(props), { depth: depth + 1, providers });
        } finally {
            hooks = undefined as any;
        }
    }

    getOrCreateState() {
        return this.state || (this.state = new State(this));
    }

    getState() {
        return this.state!;
    }

    getNodeForInsertion(): Node {
        return this.child.getNodeForInsertion();
    }

    getFirstNode(): Node {
        return this.child.getFirstNode();
    }

    getLastNode(): Node {
        return this.child.getLastNode();
    }

    unmount() {
        this.cleanup();
        this.child.unmount();
    }

    replaceWith(node: Node) {
        this.cleanup();
        this.child.replaceWith(node);
    }

    update(config: ComponentConfig) {
        if (config.props === this.config.props) return;
        this.config = config;
        this.rerender();
    }

    rerender() {
        this.dirty = false;
        const { type, props } = this.config;
        hooks = new UpdateHooks(this);
        const childConfig = type(props);
        hooks = undefined as any;
        this.child = updateVNode(this.child, childConfig, { depth: this.depth + 1, providers: this.providers });
    }

    private cleanup() {
        this.mounted = false;
        this.dirty = false;
        this.state?.runCleanupEffects();
    }
}

class ProviderNode implements BaseVNode {
    readonly type = NodeType.Provider;
    declare subscribers: Set<ComponentNode>;
    declare config: ProviderConfig;
    declare child: FragmentNode;
    declare context: NodeContext;

    constructor(config: ProviderConfig, { depth, providers }: NodeContext) {
        this.subscribers = new Set();
        this.config = config;
        this.context = { depth, providers: { ...providers, [config.type[contextId]]: this } };
        this.child = new FragmentNode(config.props.children, this.context);
    }

    getFirstNode() {
        return this.child.getFirstNode();
    }

    getLastNode() {
        return this.child.getLastNode();
    }

    getNodeForInsertion() {
        return this.child.getNodeForInsertion();
    }

    replaceWith(node: Node) {
        return this.child.replaceWith(node);
    }

    unmount() {
        return this.child.unmount();
    }

    update(config: ProviderConfig) {
        if (config === this.config) return;

        if (config.props.value !== this.config.props.value) {
            this.subscribers.forEach(s => renderController.requestComponentRerender(s));
        }
        this.config = config = config;
        this.child.update(config.props.children, this.context);
    }

    subscribe(vnode: ComponentNode) {
        this.subscribers.add(vnode);
    }

    unsubscribe(vnode: ComponentNode) {
        this.subscribers.delete(vnode);
    }
}

const contextId = Symbol();
class Provider {
    declare [contextId]: string;
    constructor(id: string) {
        this[contextId] = id;
    }
}

declare const contextMarker: unique symbol;
interface Context<T> {
    [contextMarker]: never;
    Provider: (props: { value: T, children?: NodeConfig[] }) => NodeConfig;
}

let contextLastId = 0;
const ContextImplementation = class Context {
    declare [contextId]: string;
    declare defaultValue: any;
    declare Provider: Provider;

    constructor(defaultValue: any) {
        this.defaultValue = defaultValue;
        const id = String(++contextLastId);
        this[contextId] = id;
        this.Provider = new Provider(id);
    }
}

export function createContext<T>(defaultValue: T) {
    return new ContextImplementation(defaultValue) as unknown as Context<T>;
}

type VNode =
    | NullNode
    | TextNode
    | ElementNode
    | FragmentNode
    | ComponentNode
    | ProviderNode
    ;

function createChildNodes(configs: readonly NodeConfig[] | undefined, context: NodeContext) {
    return configs?.map(config => createVNode(config, context));
}

function compareAttributes([a]: readonly [string, unknown], [b]: readonly [string, unknown]) {
    if (a < b) return -1;
    if (a > b) return 1;
    return 0;
}

function createVNode(config: NodeConfig, context: NodeContext): VNode {
    if (config == null) return new NullNode();
    if (Array.isArray(config)) return new FragmentNode(config, context);

    switch (typeof config) {
        case 'boolean':
            return new NullNode();
        case 'object':
            switch (typeof config.type) {
                case 'string':
                    return new ElementNode(config as ElementConfig, context);
                case 'function':
                    return new ComponentNode(config as ComponentConfig, context);
                case 'object':
                default:
                    return new ProviderNode(config as ProviderConfig, context);
            }
        case 'string':
        case 'number':
        case 'bigint':
        default:
            return new TextNode(config);
    }
}


function updateVNode(vnode: VNode, config: NodeConfig, context: NodeContext): VNode {
    if (config == null || config === true || config === false) {
        if (vnode.type === NodeType.Null) return vnode;
        const nullNode = new NullNode();
        vnode.replaceWith(nullNode.getNodeForInsertion());
        return nullNode;
    }
    if (Array.isArray(config)) {
        if (vnode.type === NodeType.Fragment) {
            vnode.update(config, context);
            return vnode;
        }
        const fragmentNode = new FragmentNode(config, context);
        vnode.replaceWith(fragmentNode.getNodeForInsertion());
        return fragmentNode
    }

    switch (typeof config) {
        case 'object':
            switch (typeof config.type) {
                case 'string': {
                    if (vnode.type === NodeType.Element && vnode.config.type === config.type) {
                        vnode.update(config as ElementConfig, context);
                        return vnode;
                    }
                    const elementNode = new ElementNode(config as ElementConfig, context);
                    vnode.replaceWith(elementNode.getNodeForInsertion());
                    return elementNode;
                }
                case 'function': {
                    if (vnode.type === NodeType.Component && vnode.config.type === config.type) {
                        vnode.update(config as ComponentConfig);
                        return vnode;
                    }
                    const componentNode = new ComponentNode(config as ComponentConfig, context);
                    vnode.replaceWith(componentNode.getNodeForInsertion());
                    return componentNode;
                }
                case 'object':
                default: {
                    if (vnode.type === NodeType.Provider && vnode.config.type === config.type) {
                        vnode.update(config as ProviderConfig);
                        return vnode;
                    }
                    const providerNode = new ProviderNode(config as ProviderConfig, context);
                    vnode.replaceWith(providerNode.getNodeForInsertion());
                    return providerNode;
                }
            }
        case 'string':
        case 'number':
        case 'bigint':
        default:
            if (vnode.type === NodeType.Text) {
                vnode.update(config);
                return vnode;
            } else {
                const textNode = new TextNode(config);
                vnode.replaceWith(textNode.getNodeForInsertion());
                return textNode;
            }
    }
}

export function h(type: any, props: any, ...children: any) {
    if (type === Fragment) return children;
    return { type, props: { ...props, children } };
}

export function Fragment({ children }: { children?: NodeConfig[] }) {
    return children;
}

export function mount(config: NodeConfig, element: Element | null) {
    const vnode = createVNode(config, { depth: 0, providers: {} });
    element?.appendChild(vnode.getNodeForInsertion());
    renderController.runLayoutEffects();
    renderController.renderLoop();
}

interface Effect {
    dependencies: readonly unknown[] | undefined;
    cleanup: (() => void) | undefined;
}

class State {
    declare data: any[] | undefined;
    declare effects: Effect[] | undefined;
    declare contexts: { context: any, provider: ProviderNode | undefined }[] | undefined;
    declare vnode: ComponentNode;

    constructor(vnode: ComponentNode) {
        this.vnode = vnode;
        this.data = undefined;
        this.effects = undefined;
        this.contexts = undefined;
    }

    addData(value: any) {
        (this.data || (this.data = [])).push(value);
    }

    getData(i: number) {
        return this.data![i];
    }

    addEffect(effect: Effect) {
        (this.effects || (this.effects = [])).push(effect);
    }

    getEffect(i: number) {
        return this.effects![i];
    }

    addContext(context: { context: any, provider: ProviderNode | undefined }) {
        (this.contexts || (this.contexts = [])).push(context)
    }

    getContext(i: number) {
        return this.contexts![i];
    }

    runCleanupEffects() {
        this.contexts?.forEach(c => c.provider?.unsubscribe(this.vnode));
        this.effects?.forEach(e => e.cleanup?.());

    }
}

class RenderController {
    private updateQueue: ComponentNode[] = [];
    private effects: (() => void)[] = [];
    private layoutEffects: (() => void)[] = [];

    renderLoop = () => {
        const { updateQueue, layoutEffects } = this;
        while (updateQueue.length) {
            do {
                const node = dequeueNode(updateQueue);
                if (node.dirty && node.mounted) {
                    node.rerender();
                }
            } while (updateQueue.length);

            while (layoutEffects.length) {
                const effect = layoutEffects.pop()!;
                effect();
            }
        }
    };

    requestComponentRerender(node: ComponentNode) {
        if (node.dirty || !node.mounted) {
            return;
        }
        node.dirty = true;
        const { updateQueue } = this;
        if (updateQueue.length === 0) Promise.resolve().then(this.renderLoop);
        enqueueNode(updateQueue, node);
    }

    requestEffect(effect: () => void) {
        const { effects } = this;

        if (effects.length === 0) requestAnimationFrame(() => {
            while (effects.length > 0) {
                const effect = effects.pop()!;
                effect();
            }
        });

        effects.push(effect);
    }

    requestLayoutEffect(effect: () => void) {
        this.layoutEffects.push(effect);
    }

    runLayoutEffects() {
        const { layoutEffects } = this;
        while (layoutEffects.length) {
            const effect = layoutEffects.pop()!;
            effect();
        }
    }
}

function enqueueNode(queue: ComponentNode[], node: ComponentNode) {
    let index = queue.length, parentIndex: number;
    let parent: ComponentNode;
    while (index > 0 && (parent = queue[parentIndex = (index - 1) >> 1]).depth > node.depth) {
        queue[index] = parent;
        index = parentIndex;
    }
    queue[index] = node;
}

function dequeueNode(queue: ComponentNode[]) {
    const lastNode = queue.pop()!;
    if (queue.length === 0) return lastNode;

    const result = queue[0];
    queue[0] = lastNode;

    let index = 0;
    const { length } = queue;

    let leftIndex = (index << 1) + 1;
    let rightIndex = leftIndex + 1;
    while (rightIndex < length) {
        const left = queue[leftIndex];
        const right = queue[rightIndex];

        const [candidateIndex, candidate] = left.depth < right.depth
            ? [leftIndex, left]
            : [rightIndex, right];

        if (lastNode.depth <= candidate.depth) {
            queue[index] = lastNode;
            return result;
        }

        queue[index] = candidate;
        index = candidateIndex;
        leftIndex = (index << 1) + 1;
        rightIndex = leftIndex + 1;
    }

    if (leftIndex < length) {
        const left = queue[leftIndex];
        if (lastNode.depth > left.depth) {
            queue[index] = left;
            index = leftIndex;
        }
    }

    queue[index] = lastNode;

    return result;
}

const renderController = new RenderController();

interface Hooks {
    useState<T>(init: T | (() => T)): [T, (update: T | ((old: T) => T)) => void]
    useState<T>(): [T | undefined, (update: T | undefined | ((old: T | undefined) => T)) => void];
    useMemo<T>(producer: () => T, dependencies: readonly unknown[]): T;
    useEffect(effect: () => void | (() => void), dependencies?: readonly unknown[]): void;
    useLayoutEffect(effect: () => void | (() => void), dependencies?: readonly unknown[]): void;
    useContext<T>(context: Context<T>): T;
    useImperativeHandle<T>(ref: Ref<T | null> | undefined, producer: () => T, dependencies?: readonly unknown[]): void;
    useRef<T>(init: T | (() => T)): { current: T };
}

export type Ref<T> = { current: T } | ((current: T) => void);

class CreationHooks implements Hooks {
    constructor(private readonly vnode: ComponentNode) {
    }

    useState<T>(init: T | (() => T)): [T, (update: T | ((old: T) => T)) => void];
    useState<T>(): [T | undefined, (update: T | undefined | ((old: T | undefined) => T)) => void];
    useState<T>(init?: T | (() => T)) {
        const { vnode } = this;
        const value = typeof init === 'function' ? (init as () => T)() : init;
        const setter = (update: T | ((old: T) => T)) => {
            const oldValue = data.value;
            const newValue = typeof update === 'function' ? (update as any)(oldValue) : update;
            if (oldValue !== newValue) {
                data.value = newValue;
                renderController.requestComponentRerender(vnode);
            }
        }
        const data = { value, setter };
        vnode.getOrCreateState().addData(data);
        return [value, setter];
    }

    useMemo<T>(producer: () => T, dependencies: readonly unknown[]) {
        const value = producer();
        this.vnode.getOrCreateState().addData({ value, dependencies });
        return value;
    }

    useEffect(action: () => undefined | (() => void), dependencies?: readonly unknown[]) {
        renderController.requestEffect(this.useCommonEffect(action, dependencies));
    }

    useLayoutEffect(action: () => undefined | (() => void), dependencies?: readonly unknown[]) {
        renderController.requestLayoutEffect(this.useCommonEffect(action, dependencies));
    }

    useContext<T>(context: Context<T>): T {
        const { vnode } = this;
        const data: { context: any, provider: ProviderNode | undefined } = { context, provider: vnode.providers[(context as any)[contextId]] };
        vnode.getOrCreateState().addContext(data);

        if (data.provider) {
            data.provider.subscribe(vnode);
            return data.provider.config.props.value;
        }

        return data.context.defaultValue;
    }

    useImperativeHandle<T>(ref: Ref<T | null>, producer: () => T, dependencies?: readonly unknown[]): void {
        const state = this.vnode.getOrCreateState();
        const effect: Effect = { cleanup: undefined, dependencies: undefined };
        const data = { ref, imperativeHandle: undefined as unknown as T, dependencies };
        state.addData(data);
        state.addEffect(effect);

        data.imperativeHandle = producer();
        if (typeof ref === 'function') {
            ref(data.imperativeHandle);
            effect.cleanup = () => ref(null);
        } else if (ref) {
            ref.current = data.imperativeHandle;
            effect.cleanup = () => ref.current = null;
        }

    }

    useRef<T>(init: T | (() => T)) {
        const data = { value: undefined as unknown as T };
        this.vnode.getOrCreateState().addData(data);
        /// @ts-ignore
        return data.value = { current: typeof init === 'function' ? init() : init };
    }

    private useCommonEffect(action: () => undefined | (() => void), dependencies?: readonly unknown[]): () => void {
        const data: Effect = { dependencies, cleanup: undefined };
        this.vnode.getOrCreateState().addEffect(data);
        return () => { data.cleanup = action(); };
    }
}

class UpdateHooks implements Hooks {
    private stateIndex = 0;
    private effectIndex = 0;
    private contextIndex = 0;

    constructor(private readonly vnode: ComponentNode) {
    }

    useState<T>(init: T | (() => T)): [T, (update: T | ((old: T) => T)) => void];
    useState<T>(): [T | undefined, (update: T | ((old: T | undefined) => T) | undefined) => void];
    useState() {
        const { value, setter } = this.vnode.getState().getData(this.stateIndex++);
        return [value, setter];
    }

    useMemo<T>(producer: () => T, dependencies: readonly unknown[]): T {
        const memo: { value: T, dependencies: readonly unknown[] } = this.vnode.getState().getData(this.stateIndex++);
        if (memo.dependencies.length !== dependencies.length) {
            memo.value = producer();
        }

        for (let i = 0; i < dependencies.length; i++) {
            if (dependencies[i] !== memo.dependencies[i]) {
                memo.value = producer();
                break;
            }
        }

        memo.dependencies = dependencies;
        return memo.value;
    }

    useEffect(action: () => undefined | (() => void), dependencies?: readonly unknown[] | undefined): void {
        const effect = this.useCommonEffect(action, dependencies);
        if (effect) renderController.requestEffect(effect);
    }

    useLayoutEffect(action: () => undefined | (() => void), dependencies?: readonly unknown[] | undefined): void {
        const effect = this.useCommonEffect(action, dependencies);
        if (effect) renderController.requestLayoutEffect(effect);
    }

    useContext<T>(context: Context<T>) {
        const { vnode } = this;
        const data = vnode.getState().getContext(this.contextIndex++);

        if (data.context !== context) {
            data.context = context;
            if (data.provider) {
                data.provider.unsubscribe(this.vnode);
            }

            data.provider = vnode.providers[data.context[contextId]];
            if (data.provider) {
                data.provider.subscribe(vnode);
                return data.provider.config.props.value;
            } else {
                return data.context.defaultValue;
            }
        }

        return data.provider
            ? data.provider.config.props.value
            : data.context.defaultValue;
    }

    useImperativeHandle<T>(ref: Ref<T | null>, producer: () => T, dependencies?: readonly unknown[]): void {
        const state = this.vnode.getState();
        const data = state.getData(this.stateIndex++);
        const effect = state.getEffect(this.effectIndex++);

        if (ref !== data.ref) {
            effect.cleanup?.();
            data.ref = ref;
        }

        if (haveDependenciesChanged(data.dependencies, dependencies)) {
            data.imperativeHandle = producer();
            if (typeof ref === 'function') {
                effect.cleanup = () => ref(null);
                ref(data.imperativeHandle);
            } else if (ref) {
                effect.cleanup = () => ref.current = null;
                ref.current = data.imperativeHandle as T;
            } else {
                effect.cleanup = undefined;
            }
        }
    }

    useRef<T>(): { current: T } {
        return this.vnode.getState().getData(this.stateIndex++).value;
    }

    private useCommonEffect(action: () => undefined | (() => void), dependencies?: readonly unknown[] | undefined): (() => void) | null {
        const data = this.vnode.getState().getEffect(this.effectIndex++);
        if (haveDependenciesChanged(data.dependencies, dependencies)) {
            data.dependencies = dependencies;
            return () => {
                data.cleanup?.();
                data.cleanup = action() as undefined;
            };
        }
        return null;
    }
}

function haveDependenciesChanged(previous: readonly unknown[] | undefined, next: readonly unknown[] | undefined) {
    if (!previous || !next || previous.length !== next.length) return true;
    const { length } = previous;
    for (let i = 0; i < length; i++) {
        if (previous[i] !== next[i]) return true;
    }
    return false;
}

let hooks!: Hooks;

export function useState<T>(init: T | (() => T)): [T, (update: T | ((old: T) => T)) => void]
export function useState(): [any, (update: any | ((old: any) => any)) => void];
export function useState<T>(init?: T | (() => T)) {
    return hooks.useState(init);
}

export function useMemo<T>(producer: () => T, dependencies: readonly unknown[]) {
    return hooks.useMemo(producer, dependencies);
}

export function useCallback<C extends (...args: never[]) => unknown>(callback: C, dependencies: readonly unknown[]) {
    return useMemo(() => callback, dependencies);
}

export function useEffect(effect: () => void | (() => void), dependencies?: readonly unknown[]) {
    return hooks.useEffect(effect, dependencies);
}

export function useLayoutEffect(effect: () => void | (() => void), dependencies?: readonly unknown[]) {
    return hooks.useLayoutEffect(effect, dependencies);
}


export function useContext<T>(context: Context<T>): T {
    return hooks.useContext(context);
}

export function useImperativeHandle<T>(ref: Ref<T | null> | undefined, producer: () => T, dependencies?: readonly unknown[]) {
    return hooks.useImperativeHandle(ref, producer, dependencies);
}

export function useRef<T>(init: T | (() => T)): { current: T } {
    return hooks.useRef(init);
}
