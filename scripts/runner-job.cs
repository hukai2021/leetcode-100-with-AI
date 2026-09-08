// Windows process lifetime/resource guard. This is NOT a filesystem/network security sandbox.
using System;
using System.Runtime.InteropServices;
using System.Text;
class RunnerJob {
  [StructLayout(LayoutKind.Sequential)] struct IO { public ulong a,b,c,d,e,f; }
  [StructLayout(LayoutKind.Sequential)] struct Basic { public long ProcessTime, JobTime; public uint Flags; public UIntPtr Min, Max; public uint Active; public UIntPtr Affinity; public uint Priority, Scheduling; }
  [StructLayout(LayoutKind.Sequential)] struct Extended { public Basic Basic; public IO Io; public UIntPtr ProcessMemory, JobMemory, PeakProcess, PeakJob; }
  [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Unicode)] struct Startup { public uint cb; public string reserved,desktop,title; public uint x,y,xSize,ySize,xChars,yChars,fill,flags; public ushort show,reserved2; public IntPtr reservedPtr,input,output,error; }
  [StructLayout(LayoutKind.Sequential)] struct PI { public IntPtr process,thread; public uint pid,tid; }
  [DllImport("kernel32.dll",CharSet=CharSet.Unicode)] static extern IntPtr CreateJobObject(IntPtr sa,string name);
  [DllImport("kernel32.dll")] static extern bool SetInformationJobObject(IntPtr h,int cls,ref Extended data,uint len);
  [DllImport("kernel32.dll")] static extern bool AssignProcessToJobObject(IntPtr job,IntPtr proc);
  [DllImport("kernel32.dll")] static extern bool TerminateJobObject(IntPtr job,uint code);
  [DllImport("kernel32.dll")] static extern bool TerminateProcess(IntPtr proc,uint code);
  [DllImport("kernel32.dll")] static extern IntPtr GetStdHandle(int n);
  [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)] static extern bool CreateProcess(string app,StringBuilder command,IntPtr pa,IntPtr ta,bool inherit,uint flags,IntPtr env,string cwd,ref Startup startup,out PI info);
  [DllImport("kernel32.dll")] static extern uint ResumeThread(IntPtr h);
  [DllImport("kernel32.dll")] static extern uint WaitForSingleObject(IntPtr h,uint ms);
  [DllImport("kernel32.dll")] static extern bool GetExitCodeProcess(IntPtr h,out uint code);
  [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr h);
  static string Quote(string s) { var b=new StringBuilder("\""); int n=0; foreach(char c in s) { if(c=='\\') {n++;continue;} if(c=='\"') {b.Append('\\',n*2+1);b.Append(c);n=0;continue;} b.Append('\\',n);n=0;b.Append(c); } b.Append('\\',n*2); return b.Append('"').ToString(); }
  static int Main(string[] args) {
    if(args.Length<3) return 125;
    IntPtr job=CreateJobObject(IntPtr.Zero,null);
    if(job==IntPtr.Zero) { Console.Error.WriteLine("无法创建 Windows Job Object");return 125; }
    var limit=new Extended(); limit.Basic.Flags=0x2000|0x100|0x200|0x8; limit.Basic.Active=8;
    limit.ProcessMemory=new UIntPtr(ulong.Parse(args[0])*1024*1024);limit.JobMemory=limit.ProcessMemory;
    if(!SetInformationJobObject(job,9,ref limit,(uint)Marshal.SizeOf(limit))) {CloseHandle(job);return 125;}
    var startup=new Startup();startup.cb=(uint)Marshal.SizeOf(startup);startup.flags=0x100;startup.input=GetStdHandle(-10);startup.output=GetStdHandle(-11);startup.error=GetStdHandle(-12);
    var cmd=new StringBuilder();for(int i=2;i<args.Length;i++){if(i>2)cmd.Append(' ');cmd.Append(Quote(args[i]));}
    PI p;
    if(!CreateProcess(args[2],cmd,IntPtr.Zero,IntPtr.Zero,true,0x4|0x08000000,IntPtr.Zero,null,ref startup,out p)){ Console.Error.WriteLine("CreateProcess: "+Marshal.GetLastWin32Error());CloseHandle(job);return 125; }
    if(!AssignProcessToJobObject(job,p.process)){ TerminateProcess(p.process,125);CloseHandle(p.process);CloseHandle(p.thread);CloseHandle(job);Console.Error.WriteLine("无法为进程设置资源限制");return 125; }
    ResumeThread(p.thread);CloseHandle(p.thread);
    uint wait=WaitForSingleObject(p.process,uint.Parse(args[1]));uint code=0;
    if(wait==258){TerminateJobObject(job,124);code=124;}else GetExitCodeProcess(p.process,out code);
    CloseHandle(p.process);CloseHandle(job);return unchecked((int)code);
  }
}
