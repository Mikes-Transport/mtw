using System;
using System.IO;
using System.Windows.Forms;

namespace MTWStudio.Host;

internal static class Program
{
    private static readonly string LogPath = Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
        "MTWStudio", "startup-error.log");

    [STAThread]
    private static void Main()
    {
        try
        {
            ApplicationConfiguration.Initialize();
            Application.SetUnhandledExceptionMode(UnhandledExceptionMode.CatchException);
            Application.ThreadException += (_, eventArgs) => Report(eventArgs.Exception);
            AppDomain.CurrentDomain.UnhandledException += (_, eventArgs) =>
                Report(eventArgs.ExceptionObject as Exception ??
                    new InvalidOperationException("Unhandled startup error"));
            Application.Run(new HostWindow());
        }
        catch (Exception ex)
        {
            Report(ex);
        }
    }

    private static void Report(Exception ex)
    {
        try
        {
            Directory.CreateDirectory(Path.GetDirectoryName(LogPath)!);
            File.AppendAllText(LogPath, $"[{DateTimeOffset.Now:O}] {ex}\n");
        }
        catch { /* A blocked log path must not hide the original exception. */ }
        try
        {
            MessageBox.Show("MTWStudio could not launch.\n\n" + ex.Message +
                "\n\nError details: " + LogPath,
                "MTWStudio startup error", MessageBoxButtons.OK, MessageBoxIcon.Error);
        }
        catch { /* Avoid recursive failures while reporting an exception. */ }
    }
}
