using System;
using System.Windows.Forms;

namespace MTWStudio.Host;

internal static class Program
{
    [STAThread]
    private static void Main()
    {
        ApplicationConfiguration.Initialize();
        Application.Run(new HostWindow());
    }
}
