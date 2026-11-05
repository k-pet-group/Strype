import { z } from "zod";

const SignatureArgSchema = z.object({
    name: z.string(),
    defaultValue: z.string().nullable(),
    argType: z.string().nullable(),
});

const SignatureVarArgSchema = z.object({
    name: z.string(),
    argType: z.string().nullable(),
});

const SignatureSchema = z.object({
    positionalOnlyArgs: z.array(SignatureArgSchema),
    positionalOrKeywordArgs: z.array(SignatureArgSchema),
    varArgs: SignatureVarArgSchema.nullable(),
    keywordOnlyArgs: z.array(SignatureArgSchema),
    varKwargs: SignatureVarArgSchema.nullable(),
    firstParamIsSelfOrCls: z.boolean(),
});


// Define AcResultType
export const AcResultTypeSchema = z.object({
    acResult: z.string(),
    documentation: z.string(),
    type: z.array(z.enum(["function", "module", "variable", "type"])),
    params: z
        .array(
            z.object({
                name: z.string(),
                defaultValue: z.string().optional(),
                hide: z.boolean().optional(),
            })
        )
        .optional(),
    signature: SignatureSchema.optional(),
    version: z.number(),
});

// Define AcResultsWithCategory: a record of category → array of AcResultType
export const AcResultsWithCategorySchema = z.record(z.string(), z.array(AcResultTypeSchema));
