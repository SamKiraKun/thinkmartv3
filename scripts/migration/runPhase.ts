import { execSync } from 'child_process';
import { resolve, join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT_DIR = resolve(__dirname, '..', '..');

const VALID_PHASES = ['DeltaSync'];

function runCommand(command: string) {
    console.log(`\n> Executing: ${command}`);
    try {
        execSync(command, {
            cwd: ROOT_DIR,
            stdio: 'inherit',
            env: { ...process.env, ESM_FORCE: 'true' }
        });
    } catch (error) {
        console.error(`\n❌ Command failed: ${command}`);
        process.exit(1);
    }
}

async function main() {
    const phase = process.argv[2];

    if (!phase || !VALID_PHASES.includes(phase)) {
        console.error(`Error: Invalid or missing phase argument.`);
        console.error(`Usage: npx tsx scripts/migration/runPhase.ts <Phase>`);
        console.error(`Valid phases: ${VALID_PHASES.join(', ')}`);
        process.exit(1);
    }

    console.log(`\n======================================================`);
    console.log(`🔥 Starting Migration Phase: ${phase}`);
    console.log(`======================================================\n`);

    if (phase === 'DeltaSync') {
        const isForce = process.argv.includes('--force');
        console.log(`[DeltaSync] Force Mode: ${isForce ? 'ON' : 'OFF'}`);

        console.log(`\n[1/3] Exporting from Firestore...`);
        // Using ts-node --esm to correctly resolve imports during the ETL phase
        runCommand('npx ts-node --esm scripts/migration/export-firestore/export.ts');

        console.log(`\n[2/3] Transforming Data...`);
        runCommand('npx ts-node --esm scripts/migration/transform/index.ts');

        console.log(`\n[3/3] Importing to Turso DB...`);
        runCommand('npx ts-node --esm scripts/migration/import-turso/import.ts');

        console.log(`\n✅ DeltaSync Phase Completed Successfully!`);
    }
}

main().catch(err => {
    console.error('Migration failed:', err);
    process.exit(1);
});
