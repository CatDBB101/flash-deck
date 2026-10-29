import { Stack } from "expo-router";
import { useColorScheme } from "react-native";
import { ThemeProvider } from "./theme-context";

export default function RootLayout() {
  const colorScheme = useColorScheme();

  return (
    <ThemeProvider defaultTheme={colorScheme}>
      <Stack screenOptions={{ headerShown: false }} />
    </ThemeProvider>
  );
}
