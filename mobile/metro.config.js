const path = require("node:path");
const { getDefaultConfig } = require("expo/metro-config");

const projectRoot = __dirname;
const repositoryRoot = path.resolve(projectRoot, "..");

const config = getDefaultConfig(projectRoot);

// The child app evaluates the schedule with the very same domain modules the
// Cloud Functions run, so Metro must watch the shared directory outside this
// package. One implementation, one behaviour, on both sides of the wire.
config.watchFolders = [path.resolve(repositoryRoot, "guardian")];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(repositoryRoot, "node_modules"),
];

module.exports = config;
