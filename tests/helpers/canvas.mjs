// A counting Canvas substitute for geometry checks; it does not measure GPU cost.
export function installCanvasStub() {
  let calls = 0;
  const context = new Proxy(
    {},
    {
      get(target, key) {
        if (key === "createLinearGradient")
          return () => ({ addColorStop() {} });
        if (key === "createPattern") return () => ({});
        return (
          target[key] ??
          (() => {
            calls++;
          })
        );
      },
    },
  );
  function canvas() {
    return {
      width: 1280,
      height: 720,
      getContext: () => context,
      getBoundingClientRect: () => ({ width: 1280, height: 720 }),
    };
  }
  globalThis.document = { createElement: canvas };
  globalThis.devicePixelRatio = 1;
  globalThis.Image = class {
    complete = false;
  };
  return {
    canvas,
    get calls() {
      return calls;
    },
    reset() {
      calls = 0;
    },
  };
}
