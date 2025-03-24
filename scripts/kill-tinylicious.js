import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

// 終了したいポートのリスト
const PORTS_TO_KILL = [7070, 5173, 3000];

/**
 * 指定したポートで実行中のプロセスを終了する
 */
async function killProcessOnPort(port)
{
  console.log(`Checking for processes on port ${port}...`);

  try
  {
    const { stdout } = await execAsync(`lsof -i :${port} -t`);

    if (stdout.trim())
    {
      const pids = stdout.trim().split('\n');
      console.log(`Found processes on port ${port}: ${pids.join(', ')}`);

      for (const pid of pids)
      {
        console.log(`Killing process with PID: ${pid}`);
        await execAsync(`kill -9 ${pid}`);
      }
      console.log(`All processes on port ${port} killed successfully`);
      return true;
    } else
    {
      console.log(`No process found on port ${port}`);
      return false;
    }
  } catch (error)
  {
    console.error(`Error checking or killing process on port ${port}:`, error);
    return false;
  }
}

// メイン実行関数
async function main()
{
  console.log('Starting cleanup of development processes...');

  let successCount = 0;

  // 各ポートに対して処理を実行
  for (const port of PORTS_TO_KILL)
  {
    const success = await killProcessOnPort(port);
    if (success) successCount++;
  }

  console.log(`Cleanup completed. Successfully processed ${successCount}/${PORTS_TO_KILL.length} ports.`);
}

// スクリプト実行
main().catch(error =>
{
  console.error('Unexpected error during execution:', error);
  process.exit(1);
});
