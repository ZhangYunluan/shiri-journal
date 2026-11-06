package cn.shiri.life;

import android.content.Context;
import android.content.SharedPreferences;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

/** Stores only the CloudBase session. Key material cannot leave Android Keystore.
 * The app disables Android backups; no credentials are added to diary exports.
 */
@CapacitorPlugin(name="AuthVault")
public class AuthVaultPlugin extends Plugin {
    private static final String ALIAS="shiri-cloudbase-session-v1";
    private static final byte[] AAD="shiri-auth-vault-v1".getBytes(StandardCharsets.UTF_8);
    private final ExecutorService executor=Executors.newSingleThreadExecutor();
    private SharedPreferences preferences(){return getContext().getSharedPreferences("shiri-auth-vault",Context.MODE_PRIVATE);}
    private SecretKey key() throws Exception {
        KeyStore store=KeyStore.getInstance("AndroidKeyStore");store.load(null);
        if(!store.containsAlias(ALIAS)){
            KeyGenerator generator=KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES,"AndroidKeyStore");
            generator.init(new KeyGenParameterSpec.Builder(ALIAS,KeyProperties.PURPOSE_ENCRYPT|KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).build());
            generator.generateKey();
        }
        return (SecretKey)store.getKey(ALIAS,null);
    }
    @PluginMethod public void get(PluginCall call){executor.execute(()->{
        try{
            SharedPreferences prefs=preferences();String value=prefs.getString("value",null);
            if(value==null){call.resolve(new JSObject().put("value",null));return;}
            Cipher cipher=Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.DECRYPT_MODE,key(),new GCMParameterSpec(128,Base64.decode(prefs.getString("iv",""),Base64.NO_WRAP)));
            cipher.updateAAD(AAD);
            call.resolve(new JSObject().put("value",new String(cipher.doFinal(Base64.decode(value,Base64.NO_WRAP)),StandardCharsets.UTF_8)));
        }catch(Exception error){call.reject("登录凭据无法解密，请在账号页重新登录；本地日记不受影响");}
    });}
    @PluginMethod public void set(PluginCall call){executor.execute(()->{
        try{
            String value=call.getString("value");
            if(value==null||value.getBytes(StandardCharsets.UTF_8).length>16384)throw new IllegalArgumentException();
            Cipher cipher=Cipher.getInstance("AES/GCM/NoPadding");cipher.init(Cipher.ENCRYPT_MODE,key());cipher.updateAAD(AAD);
            String encrypted=Base64.encodeToString(cipher.doFinal(value.getBytes(StandardCharsets.UTF_8)),Base64.NO_WRAP);
            boolean saved=preferences().edit().putString("iv",Base64.encodeToString(cipher.getIV(),Base64.NO_WRAP)).putString("value",encrypted).commit();
            if(!saved)throw new IllegalStateException();
            call.resolve(new JSObject().put("ok",true));
        }catch(Exception error){call.reject("安全保存登录凭据失败，请重试");}
    });}
    @PluginMethod public void clear(PluginCall call){executor.execute(()->{
        if(preferences().edit().clear().commit())call.resolve(new JSObject().put("ok",true));
        else call.reject("清除登录凭据失败，请重试");
    });}
    @Override protected void handleOnDestroy(){executor.shutdown();}
}
