import 'dotenv/config';
import inquirer from 'inquirer';
import chalk from 'chalk';
import * as Y from 'yjs';
import { createPersistence } from '../src/persistence.js';
import { loadConfig } from '../src/config.js';

// We need to define the type for persistence because it returns 'any'
interface Persistence {
  configuration: {
    fetch: (params: { documentName: string }) => Promise<Uint8Array | undefined>;
    store: (params: { documentName: string, state: Uint8Array }) => Promise<void>;
  };
  db?: {
    run: (sql: string, params: any[], callback?: (err: Error | null) => void) => void;
    close: (callback?: (err: Error | null) => void) => void;
  };
  onConfigure: () => Promise<void>;
}

async function main() {
  // Initialize configuration
  const config = loadConfig(process.env);

  // Create persistence instance
  // Note: createPersistence returns a Promise<any> which is the SQLite extension instance
  const persistence = (await createPersistence(config)) as Persistence;

  // Manually initialize the database connection since we are not running within Hocuspocus server
  if (persistence.onConfigure) {
      await persistence.onConfigure();
  }

  console.log(chalk.green(`Connected to database at: ${config.DATABASE_PATH}`));

  let running = true;
  while (running) {
    const { action } = await inquirer.prompt([{
      type: 'list',
      name: 'action',
      message: 'Select an action:',
      choices: [
        '🔍 Inspect Document',
        '🗑️ Delete Document',
        '➕ Add Test Document',
        '🚪 Exit'
      ]
    }]);

    switch (action) {
      case '🔍 Inspect Document':
        await inspectDocument(persistence);
        break;
      case '🗑️ Delete Document':
        await deleteDocument(persistence);
        break;
      case '➕ Add Test Document':
        await addTestDocument(persistence);
        break;
      case '🚪 Exit':
        running = false;
        break;
    }

    console.log(); // Empty line for readability
  }

  // Cleanup
  if (persistence.db) {
    persistence.db.close((err) => {
      if (err) console.error(chalk.red('Error closing database:', err.message));
      else console.log(chalk.gray('Database closed.'));
      process.exit(0);
    });
  } else {
    process.exit(0);
  }
}

async function inspectDocument(persistence: Persistence) {
  const { documentName } = await inquirer.prompt([{
    type: 'input',
    name: 'documentName',
    message: 'Enter document name:'
  }]);

  try {
    const data = await persistence.configuration.fetch({ documentName });
    if (!data) {
        console.log(chalk.red('Document not found.'));
        return;
    }

    const doc = new Y.Doc();
    Y.applyUpdate(doc, data);

    // Construct JSON from shared types
    const result: Record<string, any> = {};
    // Iterate over shared types
    // Yjs Doc doesn't expose an easy iterator for all shared types,
    // but we can access doc.share which is a Map
    for (const [key, type] of doc.share) {
        // type is AbstractType<any>
        // We can call toJSON() on it
        result[key] = type.toJSON();
    }

    console.log(chalk.cyan('Document Content:'));
    console.log(JSON.stringify(result, null, 2));

  } catch (e: any) {
      console.error(chalk.red('Error fetching document:', e.message));
  }
}

async function deleteDocument(persistence: Persistence) {
  const { documentName } = await inquirer.prompt([{
    type: 'input',
    name: 'documentName',
    message: 'Enter document name:'
  }]);

  const { confirm } = await inquirer.prompt([{
      type: 'confirm',
      name: 'confirm',
      message: `Are you sure you want to delete "${documentName}"?`,
      default: false
  }]);

  if (!confirm) {
      console.log(chalk.yellow('Deletion cancelled.'));
      return;
  }

  if (persistence.db) {
      await new Promise<void>((resolve, reject) => {
         persistence.db!.run('DELETE FROM "documents" WHERE name = ?', [documentName], (err) => {
             if (err) {
                 console.error(chalk.red('Error deleting document:', err.message));
                 // Don't reject, just log error and return
                 resolve();
             } else {
                 console.log(chalk.green('Document deleted successfully.'));
                 resolve();
             }
         });
      });
  } else {
      console.error(chalk.red('Database instance not available.'));
  }
}

async function addTestDocument(persistence: Persistence) {
    const { documentName } = await inquirer.prompt([{
        type: 'input',
        name: 'documentName',
        message: 'Enter new document name:'
    }]);

    const doc = new Y.Doc();
    // Add some default content
    doc.getText('content').insert(0, 'Hello World');

    // Add some metadata
    const map = doc.getMap('metadata');
    map.set('created_at', new Date().toISOString());
    map.set('created_by', 'db-debug-cli');

    const update = Y.encodeStateAsUpdate(doc);

    try {
        await persistence.configuration.store({ documentName, state: update });
        console.log(chalk.green(`Test document "${documentName}" created successfully.`));
    } catch (e: any) {
        console.error(chalk.red('Error creating document:', e.message));
    }
}

main().catch(console.error);
