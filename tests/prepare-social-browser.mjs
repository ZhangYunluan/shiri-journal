import {readFile,writeFile} from 'node:fs/promises';
// Test-only copy: production config remains empty and no external service is contacted.
const source=await readFile(new URL('../src/social-client.mjs',import.meta.url),'utf8');
await writeFile(new URL('./social-client-fixture.mjs',import.meta.url),source.replace("import {SOCIAL_API} from './social-config.mjs';","const SOCIAL_API='https://social.test.invalid';").replaceAll("from './","from '../src/"));
const cloud=await readFile(new URL('../src/private-cloud.mjs',import.meta.url),'utf8');
await writeFile(new URL('./private-cloud-fixture.mjs',import.meta.url),cloud.replace("import {SOCIAL_API} from './social-config.mjs';","const SOCIAL_API='https://social.test.invalid';").replaceAll("from './","from '../src/"));
