/**
 * Message-source declaration for injected recall messages.
 *
 * `@deepseek-ai/dsh-llm` 0.2 removed the shared catch-all `plugin` source kind:
 * every producer now declares its own `kind` through declaration merging on
 * `MessageSourceMap`, and `form` describes what kind of context it is
 * (`recall` = material extracted from past session logs, possibly reduced).
 * The 0.1.x map is merge-extensible the same way, so one plugin-owned kind
 * keeps this module compiling against both windows — and consumers that do
 * not know the kind fall through to opaque content, which is the documented
 * behavior for unknown producers.
 * @module dsh-memory-gate/message-source
 */
declare module '@deepseek-ai/dsh-llm' {
    interface MessageSourceMap {
        'dsh-memory-gate': {
            kind: 'dsh-memory-gate';
            form: 'recall';
        };
    }
}
/** Source tag attached to every injected memory message. */
export declare const MEMORY_MESSAGE_SOURCE: {
    readonly kind: "dsh-memory-gate";
    readonly form: "recall";
};
//# sourceMappingURL=message-source.d.ts.map