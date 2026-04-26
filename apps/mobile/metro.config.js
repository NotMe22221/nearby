const { getDefaultConfig } = require("expo/metro-config");
const path = require("node:path");

const projectRoot = __dirname;
const monorepoRoot = path.resolve(projectRoot, "../..");
const mobileModules = path.resolve(projectRoot, "node_modules");

const config = getDefaultConfig(projectRoot);

// 1. Watch all files in the monorepo
config.watchFolders = [monorepoRoot];

// 2. Let Metro know about the workspace packages
config.resolver.nodeModulesPaths = [
  mobileModules,
  path.resolve(monorepoRoot, "node_modules"),
];

config.resolver.disableHierarchicalLookup = false;

// 3. Hard-pin React 19 (+ scheduler) to the mobile workspace.
//    The root has react@18.3.1 (Next.js) hoisted; react-native@0.81's
//    peer-dep on react@^19 is unsatisfied — when Metro resolves `react`
//    from inside react-native's source files via hierarchical lookup it
//    finds the WRONG (root) react. extraNodeModules is only a fallback,
//    so we use resolveRequest to intercept these specific packages.
//    react-native itself is NOT pinned: only one copy exists (root,
//    correct version 0.81.5).
const PINNED = {
  react: path.resolve(mobileModules, "react"),
  "react-dom": path.resolve(mobileModules, "react-dom"),
  scheduler: path.resolve(mobileModules, "scheduler"),
};

const previousResolveRequest = config.resolver.resolveRequest;

config.resolver.resolveRequest = (context, moduleName, platform) => {
  const pinnedKey = Object.keys(PINNED).find(
    (pkg) => moduleName === pkg || moduleName.startsWith(pkg + "/"),
  );
  if (pinnedKey) {
    const subpath = moduleName.slice(pinnedKey.length);
    const fakeOrigin = path.join(mobileModules, "__pin__", "x.js");
    return context.resolveRequest(
      { ...context, originModulePath: fakeOrigin },
      PINNED[pinnedKey] + subpath,
      platform,
    );
  }
  if (previousResolveRequest) {
    return previousResolveRequest(context, moduleName, platform);
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
