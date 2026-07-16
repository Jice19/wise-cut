/* */
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import rendererViteConfig from '../vite.renderer.config';
import vitestConfig from '../vitest.config';

const getAliasReplacement = ({
    config,
    find
}: {
    config: {
        resolve?: {
            alias?: unknown;
        };
    };
    find: string;
}) => {
    const alias = config.resolve?.alias;

    if (!Array.isArray(alias)) {
        throw new Error('Renderer Vite alias must use array form');
    }

    const entry = alias.find((item) => item.find === find);

    if (!entry || typeof entry.replacement !== 'string') {
        throw new Error(`Missing renderer alias for ${find}`);
    }

    return entry.replacement;
};

const readPackageVersion = (packageDirectory: string) => {
    const packageJsonPath = path.join(packageDirectory, 'package.json');
    const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8')) as {
        version: string;
    };

    return packageJson.version;
};

describe('renderer React resolution', () => {
    it('dedupes React runtime modules to the same React instance used by ReactDOM', () => {
        const reactAlias = getAliasReplacement({
            config: rendererViteConfig,
            find: 'react'
        });
        const reactDomAlias = getAliasReplacement({
            config: rendererViteConfig,
            find: 'react-dom'
        });

        expect(rendererViteConfig.resolve?.dedupe).toEqual(
            expect.arrayContaining(['react', 'react-dom'])
        );
        expect(existsSync(path.join(reactAlias, 'index.js'))).toBe(true);
        expect(existsSync(path.join(reactDomAlias, 'client.js'))).toBe(true);
        expect(reactAlias).toBe(path.join(reactDomAlias, 'node_modules/react'));
        expect(readPackageVersion(reactAlias)).toBe(
            readPackageVersion(path.join(reactDomAlias, 'node_modules/react'))
        );
    });

    it('uses the same React aliases in Vitest SSR rendering', () => {
        expect(
            getAliasReplacement({
                config: vitestConfig,
                find: 'react'
            })
        ).toBe(
            getAliasReplacement({
                config: rendererViteConfig,
                find: 'react'
            })
        );
        expect(
            getAliasReplacement({
                config: vitestConfig,
                find: 'react-dom'
            })
        ).toBe(
            getAliasReplacement({
                config: rendererViteConfig,
                find: 'react-dom'
            })
        );
        expect(vitestConfig.resolve?.dedupe).toEqual(
            expect.arrayContaining(['react', 'react-dom'])
        );
    });
});
