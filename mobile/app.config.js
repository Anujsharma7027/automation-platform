module.exports = ({ config }) => {
  const clientId = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID;
  const clientIdPrefix = clientId?.match(/^(.+)\.apps\.googleusercontent\.com$/)?.[1];
  const iosUrlScheme = clientIdPrefix
    ? `com.googleusercontent.apps.${clientIdPrefix}`
    : undefined;

  return {
    ...config,
    plugins: [
      ...(config.plugins ?? []),
      ...(iosUrlScheme ? [['react-native-nitro-google-signin', { iosUrlScheme }]] : []),
    ],
  };
};
