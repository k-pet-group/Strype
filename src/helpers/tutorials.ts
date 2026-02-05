import * as yaml from "js-yaml";
import { z } from "zod";

export interface Tutorial {
    name: string;
    description: string | undefined;
    // Normal URL for our own built-in [trusted] tutorials:
    image: {imgURL: string | undefined};
    // A function which will asynchronously fetch the SPY file content:
    tutorialFile: () => Promise<string | undefined>;
}
// Zod Representation in YAML:
// (Zod is a validation library that automatically validates external data based
//  on a schema like this one, useful to check that externally-originating data
//  matches an expected format before dealing with it, to avoid bugs or security issues)
const TutorialSchema = z.object({
    name: z.string().min(1),
    description: z.string().optional(),
    image: z.string().min(1).optional(),
    file: z.string().min(1),
});

const TutorialsSchema = z.array(TutorialSchema);

export interface TutorialGroup {
    name: string;
    type?: string;
    tutorials: Promise<Tutorial[]>;
}


// Gets built-in tutorials from a given subdirectory
export async function getBuiltinTutorials(subdirectory: string) : Promise<Tutorial[]> {
    const dirSlash = `./tutorials/${subdirectory}/`;
    const text = await (await fetch(`${dirSlash}index.yaml`)).text();
    const rawData = yaml.load(text);
    const tutorialsYAML = TutorialsSchema.parse(rawData);
    const tutorials = [] as Tutorial[];
    for (const y of tutorialsYAML) {
        tutorials.push({
            name: y.name,
            description: y.description,
            image: {imgURL: y.image ? dirSlash + y.image : undefined},
            tutorialFile: () => fetch(dirSlash + y.file).then((res) => res.text()),
        });   
    }
    return tutorials;
}

