
import { mkdir, readdir, readFile, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';

import {
    validateVideoProject,
    type VideoProject
} from '@wise-cut/video-project';

export type VideoProjectStoreErrorCode =
    | 'DELETE_FAILED'
    | 'READ_FAILED'
    | 'VALIDATION_FAILED'
    | 'WRITE_FAILED';

export type VideoProjectStoreError = {
    code: VideoProjectStoreErrorCode;
    message: string;
};

export type VideoProjectOperationResult<T> =
    | {
          data: T;
          success: true;
      }
    | {
          error: VideoProjectStoreError;
          success: false;
      };

export type VideoProjectFileResult = {
    filePath: string;
    project: VideoProject;
};

export type VideoProjectDeleteResult = {
    projectId: string;
};

export type VideoProjectStore = {
    createProject: (input: {
        project: unknown;
    }) => Promise<VideoProjectOperationResult<VideoProjectFileResult>>;
    deleteProject: (input: {
        projectId: string;
    }) => Promise<VideoProjectOperationResult<VideoProjectDeleteResult>>;
    listProjects: () => Promise<
        VideoProjectOperationResult<VideoProjectFileResult[]>
    >;
    readProject: (input: {
        filePath: string;
    }) => Promise<VideoProjectOperationResult<VideoProject>>;
    readProjectById: (input: {
        projectId: string;
    }) => Promise<VideoProjectOperationResult<VideoProject>>;
    saveProject: (input: {
        filePath: string;
        project: unknown;
    }) => Promise<VideoProjectOperationResult<VideoProject>>;
    validateProject: (input: {
        project: unknown;
    }) => VideoProjectOperationResult<VideoProject>;
};

const toError = ({
    code,
    error
}: {
    code: VideoProjectStoreErrorCode;
    error: unknown;
}): VideoProjectStoreError => {
    if (error instanceof Error) {
        return {
            code,
            message: error.message
        };
    }

    return {
        code,
        message: String(error)
    };
};

const toValidationError = (issues: string[]): VideoProjectStoreError => {
    return {
        code: 'VALIDATION_FAILED',
        message: issues.join('\n')
    };
};

const failure = <T>(
    error: VideoProjectStoreError
): VideoProjectOperationResult<T> => {
    return {
        error,
        success: false
    };
};

const createSafeProjectId = (projectId: string) => {
    return projectId.replace(/[^a-zA-Z0-9_-]/g, '-');
};

const createProjectFileName = (projectId: string) => {
    return `${createSafeProjectId(projectId)}.miaojian.json`;
};

const serializeProject = (project: VideoProject) => {
    return `${JSON.stringify(project, null, 4)}\n`;
};

export const createVideoProjectStore = ({
    projectsDirectory
}: {
    projectsDirectory: string;
}): VideoProjectStore => {
    const validateProject: VideoProjectStore['validateProject'] = ({
        project
    }) => {
        const result = validateVideoProject(project);

        if (result.success === false) {
            return failure(toValidationError(result.issues));
        }

        return {
            data: result.data,
            success: true
        };
    };

    const saveProject: VideoProjectStore['saveProject'] = async ({
        filePath,
        project
    }) => {
        const result = validateProject({ project });

        if (result.success === false) {
            return result;
        }

        try {
            await mkdir(path.dirname(filePath), { recursive: true });
            await writeFile(filePath, serializeProject(result.data), 'utf8');

            return {
                data: result.data,
                success: true
            };
        } catch (error) {
            return failure({
                ...toError({
                    code: 'WRITE_FAILED',
                    error
                })
            });
        }
    };

    const readProject: VideoProjectStore['readProject'] = async ({
        filePath
    }) => {
        try {
            const projectContent = await readFile(filePath, 'utf8');
            const project = JSON.parse(projectContent) as unknown;

            return validateProject({ project });
        } catch (error) {
            if (error instanceof SyntaxError) {
                return failure({
                    ...toError({
                        code: 'VALIDATION_FAILED',
                        error
                    })
                });
            }

            return failure({
                ...toError({
                    code: 'READ_FAILED',
                    error
                })
            });
        }
    };

    return {
        createProject: async ({ project }) => {
            const result = validateProject({ project });

            if (result.success === false) {
                return failure(result.error);
            }

            const filePath = path.join(
                projectsDirectory,
                createProjectFileName(result.data.project.id)
            );
            const saved = await saveProject({
                filePath,
                project: result.data
            });

            if (saved.success === false) {
                return failure(saved.error);
            }

            return {
                data: {
                    filePath,
                    project: saved.data
                },
                success: true
            };
        },
        deleteProject: async ({ projectId }) => {
            const filePath = path.join(
                projectsDirectory,
                createProjectFileName(projectId)
            );

            try {
                await unlink(filePath);

                return {
                    data: {
                        projectId
                    },
                    success: true
                };
            } catch (error) {
                if (
                    error instanceof Error &&
                    'code' in error &&
                    error.code === 'ENOENT'
                ) {
                    return {
                        data: {
                            projectId
                        },
                        success: true
                    };
                }

                return failure({
                    ...toError({
                        code: 'DELETE_FAILED',
                        error
                    })
                });
            }
        },
        listProjects: async () => {
            try {
                const entries = await readdir(projectsDirectory, {
                    encoding: 'utf8',
                    withFileTypes: true
                });

                const projects: VideoProjectFileResult[] = [];

                for (const entry of entries) {
                    if (!entry.isFile()) continue;
                    if (!entry.name.endsWith('.miaojian.json')) continue;

                    const filePath = path.join(projectsDirectory, entry.name);
                    const project = await readProject({ filePath });

                    if (project.success === false) continue;

                    projects.push({
                        filePath,
                        project: project.data
                    });
                }

                return {
                    data: projects.toSorted((first, second) =>
                        second.project.project.updatedAt.localeCompare(
                            first.project.project.updatedAt
                        )
                    ),
                    success: true
                };
            } catch (error) {
                if (error instanceof Error && 'code' in error) {
                    if (error.code !== 'ENOENT') {
                        return failure({
                            ...toError({
                                code: 'READ_FAILED',
                                error
                            })
                        });
                    }

                    return {
                        data: [],
                        success: true
                    };
                }

                return failure({
                    ...toError({
                        code: 'READ_FAILED',
                        error
                    })
                });
            }
        },
        readProject,
        readProjectById: ({ projectId }) => {
            const filePath = path.join(
                projectsDirectory,
                createProjectFileName(projectId)
            );

            return readProject({ filePath });
        },
        saveProject,
        validateProject
    };
};
