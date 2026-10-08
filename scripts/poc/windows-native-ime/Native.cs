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
    [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetClassName(IntPtr h,StringBuilder text,int length);
    public static string WindowClass(int h) { var b=new StringBuilder(256); GetClassName(new IntPtr(h),b,256); return b.ToString(); }
    [DllImport("oleacc.dll")] public static extern int AccessibleObjectFromWindow(IntPtr hwnd,uint objectId,ref Guid iid,[MarshalAs(UnmanagedType.Interface)] out object accessible);
    public static object AccessibleClient(int h) { object a; Guid iid=new Guid("618736E0-3C3D-11CF-810C-00AA00389B71"); int hr=AccessibleObjectFromWindow(new IntPtr(h),0xFFFFFFFC,ref iid,out a); if(hr!=0) Marshal.ThrowExceptionForHR(hr); return a; }
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
    public static uint AltClick(int x,int y) {
        SetCursorPos(x,y); INPUT[] a=new INPUT[4];
        a[0].type=1; a[0].data.key.vk=0x12;
        a[1].type=0; a[1].data.mouse.dwFlags=2;
        a[2].type=0; a[2].data.mouse.dwFlags=4;
        a[3]=a[0]; a[3].data.key.flags=2;
        return SendInput(4,a,Marshal.SizeOf(typeof(INPUT)));
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

[StructLayout(LayoutKind.Sequential)]
public struct TFPROFILE {
    public uint type;
    public ushort language;
    public Guid clsid, profile, category;
    public IntPtr substitute;
    public uint capabilities;
    public IntPtr hkl;
    public uint flags;
}
[ComImport, Guid("71C6E74C-0F28-11D8-A82A-00065B84435C"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
public interface ITfProfileManager {
    [PreserveSig] int ActivateProfile(uint type, ushort language, ref Guid clsid, ref Guid profile, IntPtr hkl, uint flags);
    [PreserveSig] int DeactivateProfile(uint type, ushort language, ref Guid clsid, ref Guid profile, IntPtr hkl, uint flags);
    [PreserveSig] int GetProfile(uint type, ushort language, ref Guid clsid, ref Guid profile, IntPtr hkl, out TFPROFILE result);
    [PreserveSig] int EnumProfiles(ushort language, out IntPtr result);
    [PreserveSig] int ReleaseInputProcessor(ref Guid clsid, uint flags);
    [PreserveSig] int RegisterProfile(ref Guid clsid, ushort language, ref Guid profile, IntPtr description, uint descriptionLength,
        IntPtr icon, uint iconLength, uint iconIndex, IntPtr substitute, uint preferredLayout, uint enabled, uint flags);
    [PreserveSig] int UnregisterProfile(ref Guid clsid, ushort language, ref Guid profile, uint flags);
    [PreserveSig] int GetActiveProfile(ref Guid category, out TFPROFILE result);
}
public static class JapaneseTsf {
    public static string ActivateSession() {
        object instance = Activator.CreateInstance(Type.GetTypeFromCLSID(new Guid("33C53A50-F456-4884-B049-85FD643ECFED")));
        try {
            ITfProfileManager manager = (ITfProfileManager)instance;
            Guid clsid = new Guid("03B5835F-F03C-411B-9CE2-AA23E1171E36");
            Guid profile = new Guid("A76C93D9-5523-4E90-AAFA-4DB112F9AC76");
            Guid category = new Guid("34745C63-B2F0-4784-8B67-5E12C8701A31");
            int activation = manager.ActivateProfile(1,0x411,ref clsid,ref profile,IntPtr.Zero,0x20000001); // TF_IPPMF_FORSESSION | TF_IPPMF_ENABLEPROFILE
            TFPROFILE active;
            int query = manager.GetActiveProfile(ref category,out active);
            bool matches = activation == 0 && query == 0 && active.type == 1 && active.language == 0x411 && active.clsid == clsid && active.profile == profile;
            return "activationHRESULT="+activation.ToString("X8")+" queryHRESULT="+query.ToString("X8")+
                " activeMicrosoft="+matches+" type="+active.type+" language="+active.language.ToString("X4")+
                " clsid="+active.clsid+" profile="+active.profile+" flags="+active.flags+
                " scope=TF_IPPMF_FORSESSION|TF_IPPMF_ENABLEPROFILE";
        } finally { Marshal.ReleaseComObject(instance); }
    }
}
