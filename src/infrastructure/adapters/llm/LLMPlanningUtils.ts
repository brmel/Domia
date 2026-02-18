import { Plan, PlanItemType } from '@domain/entities/Plan';
import { nanoid } from 'nanoid';
import { Result, ok, err } from 'neverthrow';
import { z } from 'zod';

export const LLMPlanningUtils = {
    systemPrompt: `You are a test planning agent. Your goal is to break down the user's request into high-level steps.
You must return a JSON object that describes the plan.

Role boundary:
- Planner is strategic only.
- Do NOT output low-level action sequences (no exact clicks, coordinates, selectors, or key presses).
- Tactical decisions belong to the actor stage at execution time.
- Focus on objective decomposition, verification intent, and constraints.

Capabilities:
- Browser automation (navigating, clicking, typing)
- Visual verification
- Data extraction

Plan Item Types:
- browser: Use for high-level UI interaction objectives (without prescribing exact low-level gestures)
- vision: Use for verifying visual layout or appearance
- general: Use for logical steps or data processing

Response Format:
{
  "goal": "Refined goal description",
  "steps": [
        {
            "description": "Step 1 description",
            "type": "browser",
            "objective": "Concrete objective for this step",
            "successCriteria": ["How we know this step succeeded"],
            "evidenceExpectations": ["What evidence should be collected"],
            "constraints": ["Important constraints to respect"]
        },
    ...
  ] 
}`,

    parsePlan(text: string): Result<Plan, Error> {
        const schema = z.object({
            goal: z.string(),
            steps: z.array(z.object({
                description: z.string(),
                type: z.enum(['general', 'vision', 'code', 'browser']),
                objective: z.string().optional(),
                successCriteria: z.array(z.string()).optional(),
                evidenceExpectations: z.array(z.string()).optional(),
                constraints: z.array(z.string()).optional()
            }))
        });

        try {
            const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
            const jsonStr = (jsonMatch ? jsonMatch[1]?.trim() : text.trim()) || '{}';
            const json = JSON.parse(jsonStr);
            const parsed = schema.parse(json);

            const plan: Plan = {
                id: nanoid(),
                goal: parsed.goal,
                status: 'planning',
                createdAt: new Date(),
                updatedAt: new Date(),
                items: parsed.steps.map(s => ({
                    id: nanoid(),
                    description: s.description,
                    status: 'pending',
                    type: s.type as PlanItemType,
                    contract: {
                        objective: s.objective ?? s.description,
                        successCriteria: s.successCriteria ?? [],
                        evidenceExpectations: s.evidenceExpectations ?? [],
                        constraints: s.constraints ?? []
                    }
                }))
            };

            return ok(plan);
        } catch (e) {
            return err(new Error(`Failed to parse plan: ${e}`));
        }
    }
};
