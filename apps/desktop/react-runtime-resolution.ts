
import path from 'node:path';

const workspaceNodeModulesPath = path.resolve(__dirname, '../../node_modules');

export const reactDomPath = path.join(workspaceNodeModulesPath, 'react-dom');
export const reactPath = path.join(workspaceNodeModulesPath, 'react');

export const reactRuntimeAliases = [
    {
        find: 'react',
        replacement: reactPath
    },
    {
        find: 'react-dom',
        replacement: reactDomPath
    }
];

export const reactRuntimeDedupe = ['react', 'react-dom', 'react-dom/client'];
