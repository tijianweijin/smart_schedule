package cn.ketime.app;

import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;
import java.nio.ByteBuffer;
import java.security.KeyStore;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

/** Called by embedded Python only. Never registered as a JavaScript interface. */
public final class AndroidVault {
    private static final String ALIAS = "ketime.credentials.v1";
    private synchronized SecretKey key() throws Exception {
        KeyStore store = KeyStore.getInstance("AndroidKeyStore"); store.load(null);
        if (!store.containsAlias(ALIAS)) {
            KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
            generator.init(new KeyGenParameterSpec.Builder(ALIAS, KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setKeySize(256).setRandomizedEncryptionRequired(true).build());
            generator.generateKey();
        }
        return (SecretKey)store.getKey(ALIAS, null);
    }
    public String encryptBase64(String encoded) throws Exception {
        byte[] plain = Base64.decode(encoded, Base64.NO_WRAP);
        if (plain.length > 1048576) throw new IllegalArgumentException("Size limit");
        try {
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding"); cipher.init(Cipher.ENCRYPT_MODE, key());
            byte[] iv = cipher.getIV(), encrypted = cipher.doFinal(plain);
            return Base64.encodeToString(ByteBuffer.allocate(1+iv.length+encrypted.length).put((byte)iv.length).put(iv).put(encrypted).array(), Base64.NO_WRAP);
        } finally { java.util.Arrays.fill(plain, (byte)0); }
    }
    public String decryptBase64(String encoded) throws Exception {
        byte[] blob = Base64.decode(encoded, Base64.NO_WRAP);
        if (blob.length < 29 || blob.length > 1048640 || blob[0] != 12) throw new IllegalArgumentException("Invalid vault");
        byte[] iv = java.util.Arrays.copyOfRange(blob, 1, 13);
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding"); cipher.init(Cipher.DECRYPT_MODE, key(), new GCMParameterSpec(128, iv));
        byte[] plain = cipher.doFinal(blob, 13, blob.length-13);
        try { return Base64.encodeToString(plain, Base64.NO_WRAP); }
        finally { java.util.Arrays.fill(plain, (byte)0); }
    }
}
