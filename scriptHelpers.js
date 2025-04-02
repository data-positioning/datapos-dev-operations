// Dependencies - Vendor
const fs = require('fs').promises;

// Dependencies - Vendor (Promisify Exec)
const util = require('util');
const exec = util.promisify(require('child_process').exec);

// Utilities - Build Configuration
async function buildConfig() {
    const configJSON = await readJSONFile('src/config.json');
    const packageJSON = await readJSONFile('package.json');
    fs.writeFile('src/config.json', JSON.stringify({ ...configJSON, id: packageJSON.name, version: packageJSON.version }, undefined, 4));
}

// Utilities - Build Public Directory Index
async function buildPublicDirectoryIndex(id) {
    async function listDirectoryEntriesRecursively(directoryPath, names) {
        const entries = [];
        const localDirectoryPath = directoryPath.substring(`public/${id}`.length);
        index[localDirectoryPath.endsWith('/') ? localDirectoryPath : `${localDirectoryPath}/`] = entries;
        for (const name of names) {
            const itemPath = `${directoryPath}/${name}`;
            try {
                const stats = await fs.stat(itemPath);
                if (stats.isDirectory()) {
                    const nextLevelChildren = await fs.readdir(itemPath);
                    entries.push({ childCount: nextLevelChildren.length, name: `${name}/`, typeId: 'folder' });
                    await listDirectoryEntriesRecursively(itemPath, nextLevelChildren);
                } else {
                    entries.push({ lastModifiedAt: stats.mtimeMs, name, size: stats.size, typeId: 'object' });
                }
            } catch (error) {
                console.log(`Unable to state '${name}' in 'buildPublicDirectoryIndex'.`, error);
            }
        }
        entries.sort((left, right) => right.typeId.localeCompare(left.typeId) || left.name.localeCompare(right.name));
    }

    const index = {};
    const toplevelNames = await fs.readdir(`public/${id}/`);
    await listDirectoryEntriesRecursively(`public/${id}/`, toplevelNames);
    fs.writeFile(`./public/${id}Index.json`, JSON.stringify(index), (error) => {
        if (error) return console.error(error);
    });
}

// Utilities - Bump Version
async function bumpVersion() {
    const packageJSON = await readJSONFile('package.json');
    const versionSegments = packageJSON.version.split('.');
    packageJSON.version = `${versionSegments[0]}.${versionSegments[1]}.${Number(versionSegments[2]) + 1}`;
    fs.writeFile('package.json', JSON.stringify(packageJSON, undefined, 4));
    console.log(`Bumped to version ${packageJSON.version}.`);
}

// Utilities - Clear Directory
async function clearDirectory(directoryPath) {
    for (const itemName of await fs.readdir(directoryPath)) {
        const itemPath = `${directoryPath}/${itemName}`;
        try {
            const stats = await fs.stat(itemPath);
            if (stats.isDirectory()) {
                await fs.rm(itemPath, { recursive: true, force: true });
            } else {
                await fs.unlink(itemPath);
            }
        } catch (error) {
            console.log(`Unable to state '${itemPath}' in 'clearDirectory'.`, error);
        }
    }
}

// Utilities - Send Deployment Notice
async function sendDeploymentNotice() {
    const configJSON = await readJSONFile('src/config.json');
    const options = {
        body: JSON.stringify(configJSON),
        headers: { 'Content-Type': 'application/json' },
        method: 'PUT'
    };
    const response = await fetch(`https://operations.datapos.app/states/${configJSON.id}/deploymentNotice`, options);
    if (!response.ok) console.log(await response.text());
}

// Utilities - Sync with Github
async function syncWithGitHub() {
    const packageJSON = await readJSONFile('package.json');
    await exec('git add .');
    await exec(`git commit -m v${packageJSON.version}`);
    await exec('git push origin main:main');
}

// Utilities - Upload Connector Configuration
async function uploadConnectorConfig() {
    const configJSON = await readJSONFile('src/config.json');
    const stateId = configJSON.id;
    const options = {
        body: JSON.stringify(configJSON),
        headers: { 'Content-Type': 'application/json' },
        method: 'PUT'
    };
    const response = await fetch(`https://operations.datapos.app/states/${stateId}`, options);
    if (!response.ok) console.log(await response.text());
}

// Utilities - Upload Directory To R2
async function uploadDirectoryToR2(sourceDirectory, uploadDirectory) {
    async function listDirectoryEntriesRecursively(currentSourceDirectory, currentDestinationDirectory, names) {
        for (const name of names) {
            const sourceItemPath = `${currentSourceDirectory}/${name}`;
            const destinationItemPath = `${currentDestinationDirectory}/${name}`;
            try {
                const stats = await fs.stat(sourceItemPath);
                if (stats.isDirectory()) {
                    const nextLevelChildren = await fs.readdir(sourceItemPath);
                    await listDirectoryEntriesRecursively(sourceItemPath, destinationItemPath, nextLevelChildren);
                } else {
                    const command = `wrangler r2 object put "sample-data-eu/${currentDestinationDirectory}/${name}" --file="${currentSourceDirectory}/${name}" --jurisdiction=eu --remote`;
                    const response = await exec(command);
                    console.log('Uploading:', `${currentSourceDirectory}/${name}`);
                    if (response.stderr) {
                        console.log('Command___:', command);
                        console.log('Error_____:', response.stderr);
                    }
                }
            } catch (error) {
                console.log(`Unable to state '${name}' in 'buildPublicDirectoryIndex'.`, error);
            }
        }
    }
    const toplevelNames = await fs.readdir(`${sourceDirectory}/${uploadDirectory}/`);
    await listDirectoryEntriesRecursively(`${sourceDirectory}/${uploadDirectory}`, uploadDirectory, toplevelNames);
}

// Utilities - Read JSON File
async function readJSONFile(path) {
    try {
        return JSON.parse(await fs.readFile(path, 'utf8'));
    } catch (error) {
        console.warn(`WARN: JSON file '${path}' not found or invalid.`, error);
        return {};
    }
}

// Exposures
export { buildConfig, buildPublicDirectoryIndex, bumpVersion, clearDirectory, sendDeploymentNotice, syncWithGitHub, uploadConnectorConfig, uploadDirectoryToR2 };
