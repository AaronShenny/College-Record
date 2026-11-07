export const bridge = {
  loadWorkspace: async () => ({ schemaVersion: 1 as const, subjects: [{
    id: "sample-subject", name: "Data Structures Lab", semester: 3, courseCode: "CSL 201",
    updatedAt: "2026-11-07T10:00:00Z", trashedAt: null,
    programs: [1,2,3,4,5].map((number) => ({
      id: number === 4 ? "sample-program" : `sample-${number}`, number,
      title: ["Array operations", "Stack using an array", "Queue operations", "Binary search tree traversal", "Sorting techniques"][number-1]!,
      question: "Write a C program to create a binary search tree and display inorder, preorder and postorder traversals.",
      createdAt: "2026-11-07T10:00:00Z", updatedAt: "2026-11-07T10:00:00Z", trashedAt: null,
      sources: [{id: `source-${number}`, name: "main.c", role: "Main code", code: "void inorder(struct Node *root) {\n    if (root == NULL) return;\n    inorder(root->left);\n    printf(\"%d \", root->value);\n    inorder(root->right);\n}", include: true}],
      outputs: [{id: `output-${number}`, kind: "text" as const, name: "Console output", text: "Inorder: 10 20 30 40 60", include: true}],
      outputMayBeStale: false,
    })),
  }] }),
  saveWorkspace: async (_w: unknown) => ({ savedAt: new Date().toISOString(), revisionId: "demo", storage: "browser" as const, pendingItems: 0 }),
  getRuntime: async () => ({ mode: "browser-preview" as const, version: "demo", platform: "preview", storageLabel: "Demo", driveConnected: false, pythonAvailable: false }),
  importSource: async (): Promise<any> => null,
  pasteImage: async (): Promise<any> => null,
};
