function remapPassTargets(passTargets, fromPlayerId, ownerPlayerId) {
  const byTarget = new Map();
  for (const pass of passTargets ?? []) {
    const targetId = pass.toPlayerId === fromPlayerId ? ownerPlayerId : pass.toPlayerId;
    if (!targetId || targetId === ownerPlayerId) continue;
    byTarget.set(targetId, { ...pass, id: `pass-${ownerPlayerId}-${targetId}`, toPlayerId: targetId });
  }
  return [...byTarget.values()];
}

/** Carries an outgoing player's individual instructions, passes, and relationships to their replacement. */
export function carryTacticalReferencesThroughSubstitution(details, outgoingPlayerId, incomingPlayerId) {
  if (!details || !outgoingPlayerId || !incomingPlayerId || outgoingPlayerId === incomingPlayerId) return details;

  const relationshipMap = new Map();
  for (const relationship of details.relationships ?? []) {
    const fromPlayerId = relationship.fromPlayerId === outgoingPlayerId ? incomingPlayerId : relationship.fromPlayerId;
    const toPlayerId = relationship.toPlayerId === outgoingPlayerId ? incomingPlayerId : relationship.toPlayerId;
    if (!fromPlayerId || !toPlayerId || fromPlayerId === toPlayerId) continue;
    const key = `${fromPlayerId}-${toPlayerId}-${relationship.type}`;
    relationshipMap.set(key, { ...relationship, id: key, fromPlayerId, toPlayerId });
  }

  const inheritedInstructions = [];
  const existingInstructions = [];
  for (const instruction of details.playerInstructions ?? []) {
    if (instruction.playerId === outgoingPlayerId) {
      inheritedInstructions.push({ ...instruction, playerId: incomingPlayerId, passTargets: remapPassTargets(instruction.passTargets, outgoingPlayerId, incomingPlayerId) });
    } else if (instruction.playerId !== incomingPlayerId) {
      existingInstructions.push({ ...instruction, passTargets: remapPassTargets(instruction.passTargets, outgoingPlayerId, instruction.playerId) });
    }
  }

  return { ...details, relationships: [...relationshipMap.values()], playerInstructions: [...existingInstructions, ...inheritedInstructions] };
}
