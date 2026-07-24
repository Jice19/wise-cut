/* */
export type AgentRunEventBase = {
    createdAt: string;
    runId: string;
    sequence: number;
};

export type AgentRunEvent =
    | (AgentRunEventBase & {
          input: {
              prompt: string;
              sourceAssetDirectory: string;
          };
          type: 'run.started';
      })
    | (AgentRunEventBase & {
          nodeName: string;
          type: 'node.started';
      })
    | (AgentRunEventBase & {
          nodeName: string;
          type: 'node.completed';
      })
    | (AgentRunEventBase & {
          error: string;
          nodeName: string;
          type: 'node.failed';
      })
    | (AgentRunEventBase & {
          messageId: string;
          nodeName: string;
          title: string;
          type: 'model.stream.started';
      })
    | (AgentRunEventBase & {
          delta: string;
          messageId: string;
          nodeName: string;
          type: 'model.stream.delta';
      })
    | (AgentRunEventBase & {
          messageId: string;
          nodeName: string;
          type: 'model.stream.completed';
      })
    | (AgentRunEventBase & {
          approval: {
              payload: unknown;
              type: string;
          };
          type: 'approval.required';
      })
    | (AgentRunEventBase & {
          projectId: string;
          savedProjectPath?: string;
          type: 'run.completed';
      })
    | (AgentRunEventBase & {
          error: string;
          type: 'run.failed';
      })
    | (AgentRunEventBase & {
          assetId: string;
          fileName: string;
          keyframes: {
              dataUrl: string;
              index: number;
              timestampMs: number;
          }[];
          totalCompleted: number;
          totalScanned: number;
          type: 'asset_scan_progress';
      })
    | (AgentRunEventBase & {
          assetId: string;
          fileName: string;
          promptMatchReason: string;
          promptMatchScore: number;
          type: 'asset_understood';
          understanding: {
              actions: string[];
              description: string;
              mood: string;
              objects: string[];
              suggestedSceneType: string;
          };
      });
