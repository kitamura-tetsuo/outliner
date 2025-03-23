import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

console.log('Checking for Tinylicious process on port 7070...');

try
{
  const { stdout } = await execAsync('lsof -i :7070 -t');

  if (stdout.trim())
  {
    const pids = stdout.trim().split('\n');
    console.log(`Found Tinylicious processes: ${pids.join(', ')}`);

    for (const pid of pids)
    {
      console.log(`Killing process with PID: ${pid}`);
      await execAsync(`kill -9 ${pid}`);
    }
    console.log('All Tinylicious processes killed successfully');
  } else
  {
    console.log('No Tinylicious process found on port 7070');
  }
} catch (error)
{
  console.error('Error checking or killing Tinylicious process:', error);
}
