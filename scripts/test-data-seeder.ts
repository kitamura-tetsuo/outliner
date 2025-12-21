class TestDataSeeder {
  async createProject(name: string, pages: string[]) {
    console.log(`Creating project: ${name} with pages: ${pages.join(", ")}`);
    // TODO: Implement project creation logic
  }

  async clearAll() {
    console.log("Clearing all test data");
    // TODO: Implement data clearing logic
  }
}

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];
  const seeder = new TestDataSeeder();

  switch (command) {
    case "create-project":
      const [name, ...pages] = args.slice(1);
      if (!name) {
        console.error("Project name is required for create-project");
        process.exit(1);
      }
      await seeder.createProject(name, pages);
      break;
    case "clear-all":
      await seeder.clearAll();
      break;
    default:
      console.error(`Unknown command: ${command}`);
      console.log("Available commands: create-project <name> <pages...>, clear-all");
      process.exit(1);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
