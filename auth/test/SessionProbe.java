import com.neueda.leap.security.AuthSessionClient;
import java.io.BufferedReader;
import java.io.InputStreamReader;

/** Test-only bridge: tokens arrive through stdin, never process arguments or logs. */
class SessionProbe {
    public static void main(String[] args) throws Exception {
        String token = new BufferedReader(new InputStreamReader(System.in)).readLine();
        System.out.print(new AuthSessionClient(args[0]).test(token));
    }
}
