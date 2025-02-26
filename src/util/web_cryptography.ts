import CryptoJS from 'crypto-js'

/**
 * Provides basic cryptographical primitives using the Web Crypto API.
 */
export class WebCryptography {

    public static AES_KEY_LENGTH: number = 128;

    /**
     * THe maximum length of content that can be encrypted with RSA-OAEP used will be (4096/8) - 42 bytes.
     */
    public static RSA_MODULUS_LENGTH: number = 4096;

    /**
     * The chosen curve for the diffie-hellman key exchange.
     */
    public static ECDH_CURVE: string = "P-521";

    constructor() {
        if (!window)
            throw "This module is intended to work only in the browser";
    }

    /**
     * Generates AES-GCM symmetric key with AES_KEY_LENGTH bytes.
     */
    public async generateSymmetricKey(): Promise<string> {

        const key = await window.crypto.subtle.generateKey(
            {
                name: "AES-GCM",
                length: WebCryptography.AES_KEY_LENGTH
            },
            true,
            ["encrypt", "decrypt"]
        );

        if (key) {
            const raw: JsonWebKey = await crypto.subtle.exportKey(
                "jwk",
                key,
            );
            return JSON.stringify(raw);
        }
        throw "Could not generate symmetric key";
    }

    /**
     * Generates a RSA key pair with a modulus of RSA_MODULUS_LENGTH
     */
    public async generateKeyPair(): Promise<{ publicKey: string; privateKey: string }> {
        let keyPair = await window.crypto.subtle.generateKey(
            {
                name: "RSA-OAEP",
                modulusLength: WebCryptography.RSA_MODULUS_LENGTH,
                publicExponent: new Uint8Array([1, 0, 1]),
                hash: "SHA-256"
            },
            true,
            ["encrypt", "decrypt"]
        );

        if (keyPair.publicKey && keyPair.privateKey) {

            const exportedPublicKey: ArrayBuffer = await window.crypto.subtle.exportKey("spki", keyPair.publicKey);
            const exportedPrivateKey: ArrayBuffer = await window.crypto.subtle.exportKey("pkcs8", keyPair.privateKey);

            return {
                publicKey: btoa(this.ab2str(exportedPublicKey)),
                privateKey: btoa(this.ab2str(exportedPrivateKey))
            }
        }
        throw "Could not generate key pairs";
    }

    /**
     * Generate an ECDH key pair used for deriving a shared secret.
     */
    public async generateECDHKeyPair(): Promise<{ publicKey: string; privateKey: string }> {
        let keyPair = await window.crypto.subtle.generateKey(
            {
                name: "ECDH",
                namedCurve: WebCryptography.ECDH_CURVE
            },
            true,
            ["deriveKey"]
        );

        if (keyPair.publicKey && keyPair.privateKey) {
            const exportedPublicKey: ArrayBuffer = await window.crypto.subtle.exportKey("spki", keyPair.publicKey);
            const exportedPrivateKey: ArrayBuffer = await window.crypto.subtle.exportKey("pkcs8", keyPair.privateKey);

            return {
                publicKey: btoa(this.ab2str(exportedPublicKey)),
                privateKey: btoa(this.ab2str(exportedPrivateKey))
            }
        }
        throw "Could not generate key pairs";
    }

    /**
     * Using the DH algorithm, this method derives a shared secret from the provided source private key and the target
     * user's public key.
     * The shared secret will be used to encrypt & decrypt the data.
     */
    public async deriveSharedSecretKey(sourcePrivateKey: string, targetPublicKey: string): Promise<string> {
        const importedPublicKey = await window.crypto.subtle.importKey(
            "spki",
            this.str2ab(atob(targetPublicKey)),
            { name: "ECDH", namedCurve: WebCryptography.ECDH_CURVE },
            true,
            []);

        const importedPrivateKey = await window.crypto.subtle.importKey(
            "pkcs8",
            this.str2ab(atob(sourcePrivateKey)),
            { name: "ECDH", namedCurve: WebCryptography.ECDH_CURVE },
            true,
            ['deriveKey']);

        const derivedKey: CryptoKey = await window.crypto.subtle.deriveKey(
            {
                name: "ECDH",
                public: importedPublicKey
            },
            importedPrivateKey,
            {
                name: "AES-GCM",
                length: 256
            },
            true,
            ["encrypt", "decrypt"]
        );

        const raw: JsonWebKey = await crypto.subtle.exportKey(
            "jwk",
            derivedKey,
        );
        return JSON.stringify(raw);
    }

    /**
     * Encrypts a message using a provided symmetric key.
     * Throws an exception if the key is invalid
     */
    public async encryptMessageSymmetric(message: string, symmetricKey: string): Promise<string> {
        const importedSymmetricKey = await window.crypto.subtle.importKey(
            "jwk",
            JSON.parse(symmetricKey),
            "AES-GCM",
            true,
            ['encrypt', 'decrypt']);

        const iv_substring = symmetricKey.substring(0, 10);


        const encrypted: ArrayBuffer = await window.crypto.subtle.encrypt(
            {
                name: "AES-GCM",
                iv: this.str2ab(iv_substring)
            },
            importedSymmetricKey,
            this.str2ab(message));

        return btoa(this.ab2str(encrypted));
    }

    /**
     * Decrypts a message using a provided symmetric key.
     * Throws an exception if the key is invalid
     */
    public async decryptMessageSymmetric(cyphertext: string, symmetricKey: string): Promise<string> {
        const importedSymmetricKey = await window.crypto.subtle.importKey(
            "jwk",
            JSON.parse(symmetricKey),
            "AES-GCM",
            true,
            ['encrypt', 'decrypt']);

        const iv_substring = symmetricKey.substring(0, 10);

        const decrypted: ArrayBuffer = await window.crypto.subtle.decrypt(
            {
                name: "AES-GCM",
                iv: this.str2ab(iv_substring)
            },
            importedSymmetricKey,
            this.str2ab(atob(cyphertext)));

        return this.ab2str(decrypted);
    }

    /**
     * Encrypts a message using a provided public key.
     * Throws an exception if the key is invalid.
     * Throws an exception if the message length is longer than the supported length, mentioned above.
     */
    public async encryptMessageAsymmetric(message: string, publicKey: string): Promise<string> {
        const importedPublicKey = await window.crypto.subtle.importKey(
            "spki",
            this.str2ab(atob(publicKey)),
            { name: "RSA-OAEP", hash: "SHA-256" },
            true,
            ['encrypt']);

        const encryptedBytes: ArrayBuffer = await window.crypto.subtle.encrypt(
            {
                name: "RSA-OAEP"
            },
            importedPublicKey,
            this.str2ab(message)
        );

        return btoa(this.ab2str(encryptedBytes));
    }

    /**
     * Decrypts a message using a provided public key.
     * Throws an exception if the key is invalid.
     */
    public async decryptMessageAsymmetric(cyphertext: string, privateKey: string): Promise<string> {
        const importedPrivateKey = await window.crypto.subtle.importKey(
            "pkcs8",
            this.str2ab(atob(privateKey)),
            { name: "RSA-OAEP", hash: "SHA-256" },
            true,
            ['decrypt']);

        const decryptedBytes: ArrayBuffer = await window.crypto.subtle.decrypt(
            {
                name: "RSA-OAEP"
            },
            importedPrivateKey,
            this.str2ab(atob(cyphertext))
        );

        return this.ab2str(decryptedBytes);
    }

    /**
     * Returns the SHA-256 hash of the provided text.
     */
    public hash(plaintext: string): string {
        const hash = CryptoJS.SHA256(plaintext);
        return hash.toString(CryptoJS.enc.Base64);
    }

    /**
     * Converts an array buffer to a string.
     */
    public ab2str(buf: ArrayBuffer) {
        //@ts-ignore
        return String.fromCharCode.apply(null, new Uint8Array(buf));
    }

    /**
     * Converts a string to an array buffer.
     */
    public str2ab(str: string) {
        var buf = new ArrayBuffer(str.length);
        var bufView = new Uint8Array(buf);
        for (var i = 0, strLen = str.length; i < strLen; i++) {
            bufView[i] = str.charCodeAt(i);
        }
        return buf;
    }
}

const webcrypto = new WebCryptography();

export default webcrypto;