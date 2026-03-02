export class TypedEventEmitter {
    listeners = new Map();
    on(event, handler) {
        const eventListeners = this.listeners.get(event) ?? new Set();
        eventListeners.add(handler);
        this.listeners.set(event, eventListeners);
    }
    off(event, handler) {
        this.listeners.get(event)?.delete(handler);
    }
    emit(event, ...args) {
        const eventListeners = this.listeners.get(event);
        if (!eventListeners) {
            return;
        }
        for (const listener of eventListeners) {
            listener(...args);
        }
    }
}
//# sourceMappingURL=events.js.map