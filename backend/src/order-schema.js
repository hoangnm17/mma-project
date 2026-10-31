// Snapshots keep catalogue changes from altering an order already accepted.
export const orderDefinitions = {
  Orders: {
    id: { type: "string", required: true },
    kind: { type: "string", required: true },
    specialPurpose: { type: "string", required: false, default: null },
    stayId: { type: "string", required: true, ref: ["Stays", "id"] },
    status: { type: "string", required: true, default: "PENDING" },
    itemsJson: { type: "string", required: true },
    total: { type: "number", required: true },
    notes: { type: "string", required: true, default: "" },
    createdBy: { type: "string", required: true, ref: ["Users", "id"] },
    requestedAt: { type: "date", required: true, default: "$now" },
    startedAt: { type: "date", required: false, default: null },
    completedAt: { type: "date", required: false, default: null },
    cancelledAt: { type: "date", required: false, default: null },
    updatedAt: { type: "date", required: true, default: "$now" },
  },
};
