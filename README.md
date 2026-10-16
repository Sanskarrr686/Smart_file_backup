# Team A Backup Scheduler

## Java version

This project requires JDK 21. Configure `JAVA_HOME` to point to your JDK 21
installation and ensure `%JAVA_HOME%\bin` appears before other Java
installations in `PATH`. Restart your terminal after changing environment
variables, then verify the active runtime:

```powershell
java -version
mvn -version
```

Both commands should report Java 21. Maven also checks the active JDK when a
build starts and reports an error if it is not Java 21.

Run the build and tests with:

```powershell
mvn verify
```
