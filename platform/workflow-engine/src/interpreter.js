export class WorkflowInterpreter {
    definition;
    stageMap = new Map();
    constructor(definition) {
        this.definition = definition;
        for (const stage of definition.stages) {
            this.stageMap.set(stage.id, stage);
        }
    }
    async run(context) {
        const results = [];
        let current = this.definition.stages[0];
        while (current) {
            const step = await this.executeStage(current, context);
            results.push(step);
            if (step.done || !step.nextStageId) {
                break;
            }
            current = this.stageMap.get(step.nextStageId);
        }
        return results;
    }
    async executeStage(stage, context) {
        switch (stage.type) {
            case "greeting":
            case "conversation":
                return { stageId: stage.id, stageType: stage.type, done: false, nextStageId: stage.next };
            case "extraction":
                context.extractions[stage.id] = {
                    completionScore: 0,
                    fields: {},
                };
                return { stageId: stage.id, stageType: stage.type, done: false, nextStageId: stage.next };
            case "memory_read":
            case "memory_write":
            case "action":
            case "condition":
            case "handoff":
                return { stageId: stage.id, stageType: stage.type, done: false, nextStageId: stage.next };
            case "end":
                return { stageId: stage.id, stageType: stage.type, done: true };
            default:
                return { stageId: stage.id, stageType: "unknown", done: true };
        }
    }
}
//# sourceMappingURL=interpreter.js.map