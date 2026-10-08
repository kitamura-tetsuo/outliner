using System;
using System.Runtime.InteropServices;
using System.Text;
public static class Native {
    [StructLayout(LayoutKind.Sequential)] public struct POINT { public int X,Y; }
    [StructLayout(LayoutKind.Sequential)] public struct MOUSEINPUT { public int dx,dy; public uint mouseData,dwFlags,time; public UIntPtr extra; }
    [StructLayout(LayoutKind.Sequential)] public struct KEYBDINPUT { public ushort vk,scan; public uint flags,time; public UIntPtr extra; }
    [StructLayout(LayoutKind.Explicit)] public struct UNION { [FieldOffset(0)] public MOUSEINPUT mouse; [FieldOffset(0)] public KEYBDINPUT key; }
    [StructLayout(LayoutKind.Sequential)] public struct INPUT { public uint type; public UNION data; }
    [DllImport("user32.dll", SetLastError=true)] public static extern uint SendInput(uint n, INPUT[] inputs, int size);
    [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hwnd, out uint pid);
    [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hwnd);
    [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hwnd, int command);
    [DllImport("user32.dll")] public static extern bool SetCursorPos(int x,int y);
    [DllImport("user32.dll")] public static extern IntPtr GetKeyboardLayout(uint thread);
    [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern IntPtr LoadKeyboardLayout(string id,uint flags);
    [DllImport("user32.dll")] public static extern bool PostMessage(IntPtr hwnd,uint message,IntPtr w,IntPtr l);
    [DllImport("user32.dll", SetLastError=true)] public static extern IntPtr OpenInputDesktop(uint flags,bool inherit,uint access);
    [DllImport("user32.dll")] public static extern bool CloseDesktop(IntPtr desktop);
    [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern bool GetUserObjectInformation(IntPtr h,int index,StringBuilder text,int len,out int needed);
    [DllImport("imm32.dll",CharSet=CharSet.Unicode)] public static extern uint ImmGetDescription(IntPtr h,StringBuilder text,uint len);
    [DllImport("user32.dll")] public static extern uint GetDpiForWindow(IntPtr h);
    public static uint Key(ushort vk) {
        INPUT[] a=new INPUT[2]; a[0].type=1; a[0].data.key.vk=vk;
        a[1]=a[0]; a[1].data.key.flags=2;
        return SendInput(2,a,Marshal.SizeOf(typeof(INPUT)));
    }
    public static uint Click(int x,int y) {
        SetCursorPos(x,y); INPUT[] a=new INPUT[2];
        a[0].type=0; a[0].data.mouse.dwFlags=2; a[1].type=0; a[1].data.mouse.dwFlags=4;
        return SendInput(2,a,Marshal.SizeOf(typeof(INPUT)));
    }
    public static string InputDesktop() {
        IntPtr h=OpenInputDesktop(0,false,0x0001); if(h==IntPtr.Zero) return "ERROR:"+Marshal.GetLastWin32Error();
        try { var b=new StringBuilder(256); int n;
            if(!GetUserObjectInformation(h,2,b,512,out n)) return "ERROR:"+Marshal.GetLastWin32Error();
            return b.ToString();
        } finally { CloseDesktop(h); }
    }
    public static string ForegroundProfile() {
        uint pid; uint tid=GetWindowThreadProcessId(GetForegroundWindow(),out pid);
        IntPtr h=GetKeyboardLayout(tid); var b=new StringBuilder(256); ImmGetDescription(h,b,256);
        return "pid="+pid+" tid="+tid+" hkl="+h.ToInt64().ToString("X")+" immDescription="+b;
    }
}
