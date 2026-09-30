// Manual application of the Typert `@Remote` method markers.
//
// DSH ships `@Remote` as a standard method decorator, but the harness plugins are
// TypeScript-compiled. This bundle is hand-written ESM, and Node does not parse
// decorator syntax in plain .js. So instead of `@Remote("name")` syntax we call the
// public `Remote("name")` decorator ourselves, once per method, with a decorator
// context the protocol accepts, and run the resulting initializers against a
// prototype-backed object. The marker is stored on the class prototype, which is
// exactly where `remoteMethods()` reads it from, so every instance is covered.

import { Remote } from '@deepseek-ai/dsh-typert-protocol'

/**
 * Attach `@Remote` markers for the given methods to a class prototype.
 * @param {Function} cls the class (its `.prototype` receives the markers)
 * @param {Record<string, string>} methodExports map of method name -> Remote export name
 */
export function applyRemoteMarkers(cls, methodExports) {
	const initializers = []
	for (const [method, exportName] of Object.entries(methodExports)) {
		const decorator = Remote(exportName)
		// A standard method decorator receives (value, context). We only need the
		// context to register the marker initializer; the value is unused by Remote.
		decorator(cls.prototype[method], {
			kind: 'method',
			name: method,
			private: false,
			static: false,
			addInitializer(fn) { initializers.push(fn) },
		})
	}
	// Run the initializers once against an object whose prototype is the class
	// prototype, so `Object.getPrototypeOf(this)` resolves to it and the marker is
	// installed on the shared prototype.
	const receiver = Object.create(cls.prototype)
	for (const init of initializers) init.call(receiver)
}
