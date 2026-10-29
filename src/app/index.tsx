import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { router } from "expo-router";
import { useEffect, useState } from "react";
import {
    Alert,
    FlatList,
    KeyboardAvoidingView,
    Modal,
    Platform,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";
import NotionService from "../services/notion";
import { useTheme } from "./theme-context";

const STORAGE_KEY = "@my_decks";

export default function Index() {
    const { theme, toggleTheme } = useTheme();
    const [decks, setDecks] = useState([]);
    const [isModalVisible, setIsModalVisible] = useState(false);
    const [deckName, setDeckName] = useState("");
    const [apiToken, setApiToken] = useState("");
    const [dailyGoal, setDailyGoal] = useState("5");

    const [isAddCardModalVisible, setIsAddCardModalVisible] = useState(false);
    const [selectedDeck, setSelectedDeck] = useState(null);
    const [newCardFront, setNewCardFront] = useState("");
    const [newCardBack, setNewCardBack] = useState("");
    const [isAddingCard, setIsAddingCard] = useState(false);

    const [isEditModalVisible, setIsEditModalVisible] = useState(false);
    const [editDeckName, setEditDeckName] = useState("");
    const [editDailyGoal, setEditDailyGoal] = useState("");

    useEffect(() => {
        loadDecks();
    }, []);

    const loadDecks = async () => {
        try {
            const storedDecks = await AsyncStorage.getItem(STORAGE_KEY);
            if (storedDecks) {
                const parsedDecks = JSON.parse(storedDecks);

                // Update card counts from Notion API for each deck
                const updatedDecks = await Promise.all(
                    parsedDecks.map(async (deck) => {
                        try {
                            // We use a dummy databaseId if not present in deck,
                            // but in a real app, databaseId should be part of deck metadata.
                            // Using the same ID as NotionService.addCard for consistency.
                            const databaseId =
                                "3fdfb597c246808a8669e378cfc445f5";
                            const cards = await NotionService.queryDatabase(
                                deck.token,
                                databaseId,
                            );
                            return { ...deck, cardCount: cards.length };
                        } catch (error) {
                            console.error(
                                `Failed to fetch count for deck ${deck.title}:`,
                                error,
                            );
                            return deck;
                        }
                    }),
                );

                setDecks(updatedDecks);
            }
        } catch (error) {
            console.error("Failed to load decks:", error);
        }
    };

    const handleAddDeck = async () => {
        if (!deckName || !apiToken) {
            alert("กรุณากรอกข้อมูลให้ครบถ้วน");
            return;
        }

        const newDeck = {
            id: Date.now().toString(),
            title: deckName,
            token: apiToken,
            cardCount: 0, // เริ่มต้นที่ 0 จนกว่าจะดึงจาก Notion
            lastStudied: "ยังไม่ได้เริ่ม",
            color: "#F2F2F7",
            icon: "book-outline",
            dailyGoal: parseInt(dailyGoal) || 5,
            addedToday: 0,
            lastAddedDate: new Date().toISOString().split("T")[0],
        };

        try {
            const updatedDecks = [...decks, newDeck];
            await AsyncStorage.setItem(
                STORAGE_KEY,
                JSON.stringify(updatedDecks),
            );
            setDecks(updatedDecks);

            setIsModalVisible(false);
            setDeckName("");
            setApiToken("");
        } catch (error) {
            console.error("Failed to save deck:", error);
        }
    };

    const deleteDeck = async (id) => {
        try {
            const filteredDecks = decks.filter((deck) => deck.id !== id);
            await AsyncStorage.setItem(
                STORAGE_KEY,
                JSON.stringify(filteredDecks),
            );
            setDecks(filteredDecks);
        } catch (error) {
            console.error("Failed to delete deck:", error);
        }
    };

    const handleUpdateDeckGoal = async (id, newGoal) => {
        try {
            const updatedDecks = decks.map((deck) =>
                deck.id === id
                    ? { ...deck, dailyGoal: parseInt(newGoal) || 5 }
                    : deck,
            );
            await AsyncStorage.setItem(
                STORAGE_KEY,
                JSON.stringify(updatedDecks),
            );
            setDecks(updatedDecks);
        } catch (error) {
            console.error("Failed to update deck goal:", error);
        }
    };

    const handleEditDeck = async () => {
        if (!selectedDeck) return;

        try {
            const updatedDecks = decks.map((deck) =>
                deck.id === selectedDeck.id
                    ? {
                          ...deck,
                          title: editDeckName,
                          dailyGoal: parseInt(editDailyGoal) || 5,
                      }
                    : deck,
            );
            await AsyncStorage.setItem(
                STORAGE_KEY,
                JSON.stringify(updatedDecks),
            );
            setDecks(updatedDecks);
            setIsEditModalVisible(false);
        } catch (error) {
            console.error("Failed to edit deck:", error);
            Alert.alert("ข้อผิดพลาด", "ไม่สามารถแก้ไขข้อมูลได้");
        }
    };

    const handleAddCard = async () => {
        if (!newCardFront || !newCardBack || !selectedDeck) {
            Alert.alert("ข้อผิดพลาด", "กรุณากรอกคำศัพท์และคำแปลให้ครบถ้วน");
            return;
        }

        setIsAddingCard(true);
        try {
            await NotionService.addCard(selectedDeck.token, {
                Front: newCardFront,
                Back: newCardBack,
                Repetitions: 0,
                EaseFactor: 2.5,
                IntervalDays: 0,
                NextReviewDate: new Date().toISOString().split("T")[0],
            });

            // อัปเดตจำนวนคำที่เพิ่มในวันนี้
            const today = new Date().toISOString().split("T")[0];
            const updatedDecks = decks.map((deck) => {
                if (deck.id === selectedDeck.id) {
                    const isNewDay = deck.lastAddedDate !== today;
                    return {
                        ...deck,
                        addedToday: isNewDay ? 1 : (deck.addedToday || 0) + 1,
                        lastAddedDate: today,
                    };
                }
                return deck;
            });

            await AsyncStorage.setItem(
                STORAGE_KEY,
                JSON.stringify(updatedDecks),
            );
            setDecks([...updatedDecks]);

            Alert.alert("สำเร็จ", "เพิ่มคำศัพท์เรียบร้อยแล้ว!");
            setNewCardFront("");
            setNewCardBack("");
            setIsAddCardModalVisible(false);
        } catch (error) {
            console.error("Failed to add card:", error);
            Alert.alert(
                "ข้อผิดพลาด",
                "ไม่สามารถเพิ่มคำศัพท์ได้ กรุณาตรวจสอบ Token",
            );
        } finally {
            setIsAddingCard(false);
        }
    };

    const renderItem = ({ item }) => (
        <TouchableOpacity
            style={[styles.deckItem, theme === "dark" && styles.deckItemDark]}
            onPress={() => {
  const today = new Date().toISOString().split('T')[0];
  const isNewDay = item.lastStudied !== today;
  const navigate = () => {
    router.push(`/deck/${item.id}${isNewDay ? '' : '?mode=train'}`);
  };
  if (!isNewDay) {
    Alert.alert('Training Mode', 'You are now in training mode');
  }
  // Update deck metadata locally
  const updatedDecks = decks.map(d => {
    if (d.id === item.id) {
      return {
        ...d,
        lastStudied: today,
        addedToday: isNewDay ? d.addedToday : d.addedToday, // keep addedToday unchanged; will be reset elsewhere if needed
      };
    }
    return d;
  });
  AsyncStorage.setItem('@my_decks', JSON.stringify(updatedDecks));
  setDecks(updatedDecks);
  navigate();
}}
            activeOpacity={0.7}
        >
            <View
                style={[
                    styles.iconContainer,
                    {
                        backgroundColor:
                            theme === "light"
                                ? item.color || "#F2F2F7"
                                : "#2C2C2E",
                    },
                ]}
            >
                <Ionicons
                    name={item.icon as any}
                    size={24}
                    color={theme === "light" ? "#333" : "#FFFFFF"}
                />
            </View>
            <View style={styles.textContainer}>
                <Text
                    style={[
                        styles.deckTitle,
                        theme === "dark" && styles.textDark,
                    ]}
                >
                    {item.title}
                </Text>
                <View style={styles.detailsRow}>
                    <Text
                        style={[
                            styles.deckDetails,
                            theme === "dark" && styles.textDarkDetails,
                        ]}
                    >
                        {item.cardCount} การ์ด • {item.lastStudied}
                    </Text>
                    <View
                        style={[
                            styles.goalBadge,
                            theme === "dark" && styles.goalBadgeDark,
                        ]}
                    >
                        <Text
                            style={[
                                styles.goalText,
                                theme === "dark" && styles.goalTextDark,
                            ]}
                        >
                            🎯 {item.addedToday || 0}/{item.dailyGoal || 5}{" "}
                            คำวันนี้
                        </Text>
                    </View>
                </View>
            </View>
            <View style={styles.actionContainer}>
                <TouchableOpacity
                    onPress={() => {
                        setSelectedDeck(item);
                        setEditDeckName(item.title);
                        setEditDailyGoal(item.dailyGoal?.toString() || "5");
                        setIsEditModalVisible(true);
                    }}
                    style={styles.iconAction}
                >
                    <Ionicons
                        name="create-outline"
                        size={22}
                        color={theme === "light" ? "#666" : "#AAA"}
                    />
                </TouchableOpacity>
                <TouchableOpacity
                    onPress={() => {
                        setSelectedDeck(item);
                        setIsAddCardModalVisible(true);
                    }}
                    style={styles.iconAction}
                >
                    <Ionicons
                        name="add-circle-outline"
                        size={24}
                        color={theme === "light" ? "#007AFF" : "#AAA"}
                    />
                </TouchableOpacity>
                <TouchableOpacity
                    style={[
                        styles.studyButton,
                        {
                            backgroundColor:
                                theme === "light" ? "#000000" : "#FFFFFF",
                            borderColor:
                                theme === "dark" ? "#FFFFFF" : "#000000",
                            borderWidth: 1,
                        },
                    ]}
                    onPress={() => {
  const today = new Date().toISOString().split('T')[0];
  const isNewDay = item.lastStudied !== today;
  const navigate = () => {
    router.push(`/deck/${item.id}${isNewDay ? '' : '?mode=train'}`);
  };
  if (!isNewDay) {
    Alert.alert('Training Mode', 'You are now in training mode');
  }
  // Update deck metadata locally
  const updatedDecks = decks.map(d => {
    if (d.id === item.id) {
      return {
        ...d,
        lastStudied: today,
        addedToday: isNewDay ? d.addedToday : d.addedToday, // keep addedToday unchanged; will be reset elsewhere if needed
      };
    }
    return d;
  });
  AsyncStorage.setItem('@my_decks', JSON.stringify(updatedDecks));
  setDecks(updatedDecks);
  navigate();
}}
                >
                    <Text
                        style={[
                            styles.studyButtonText,
                            {
                                color:
                                    theme === "light" ? "#FFFFFF" : "#000000",
                            },
                        ]}
                    >
                        เรียน
                    </Text>
                </TouchableOpacity>
            </View>
        </TouchableOpacity>
    );

    return (
        <View
            style={[styles.container, theme === "dark" && styles.containerDark]}
        >
            <View style={styles.header}>
                <View
                    style={{
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 10,
                    }}
                >
                    <Text
                        style={[
                            styles.title,
                            theme === "dark" && styles.titleDark,
                        ]}
                    >
                        My Decks
                    </Text>
                    <TouchableOpacity
                        onPress={toggleTheme}
                        style={styles.themeButton}
                    >
                        <Ionicons
                            name={theme === "light" ? "moon" : "sunny"}
                            size={24}
                            color={theme === "light" ? "#333" : "#FFF"}
                        />
                    </TouchableOpacity>
                </View>
                <TouchableOpacity
                    style={styles.addButton}
                    onPress={() => setIsModalVisible(true)}
                >
                    <Ionicons name="add" size={28} color="#FFF" />
                </TouchableOpacity>
            </View>

            <FlatList
                data={decks}
                renderItem={renderItem}
                keyExtractor={(item) => item.id}
                contentContainerStyle={styles.listContent}
                showsVerticalScrollIndicator={false}
                ListEmptyComponent={
                    <View style={styles.emptyContainer}>
                        <Ionicons
                            name="library-outline"
                            size={64}
                            color={theme === "light" ? "#DDD" : "#444"}
                        />
                        <Text
                            style={[
                                styles.emptyText,
                                theme === "dark" && styles.emptyTextDark,
                            ]}
                        >
                            ยังไม่มีชุดการ์ด\nเริ่มสร้างชุดการ์ดแรกของคุณเลย!
                        </Text>
                    </View>
                }
            />

            <Modal
                visible={isEditModalVisible}
                transparent={true}
                animationType="fade"
            >
                <KeyboardAvoidingView
                    behavior={Platform.OS === "ios" ? "padding" : "height"}
                    style={styles.modalOverlay}
                >
                    <View
                        style={[
                            styles.modalContent,
                            theme === "dark" && styles.modalContentDark,
                        ]}
                    >
                        <View style={styles.modalHeader}>
                            <Text
                                style={[
                                    styles.modalTitle,
                                    theme === "dark" && styles.modalTitleDark,
                                ]}
                            >
                                Edit Deck
                            </Text>
                            <TouchableOpacity
                                onPress={() => setIsEditModalVisible(false)}
                            >
                                <Ionicons
                                    name="close"
                                    size={24}
                                    color={theme === "light" ? "#666" : "#AAA"}
                                />
                            </TouchableOpacity>
                        </View>

                        <View style={styles.form}>
                            <Text
                                style={[
                                    styles.label,
                                    theme === "dark" && styles.labelDark,
                                ]}
                            >
                                Deck Name
                            </Text>
                            <TextInput
                                style={[
                                    styles.input,
                                    theme === "dark" && styles.inputDark,
                                ]}
                                placeholder="Enter deck name..."
                                placeholderTextColor={
                                    theme === "light" ? "#999" : "#666"
                                }
                                value={editDeckName}
                                onChangeText={setEditDeckName}
                            />

                            <Text
                                style={[
                                    styles.label,
                                    theme === "dark" && styles.labelDark,
                                ]}
                            >
                                Daily Goal (Words)
                            </Text>
                            <TextInput
                                style={[
                                    styles.input,
                                    theme === "dark" && styles.inputDark,
                                ]}
                                placeholder="e.g. 5"
                                placeholderTextColor={
                                    theme === "light" ? "#999" : "#666"
                                }
                                keyboardType="numeric"
                                value={editDailyGoal}
                                onChangeText={setEditDailyGoal}
                            />

                            <TouchableOpacity
                                style={styles.submitButton}
                                onPress={handleEditDeck}
                            >
                                <Text style={styles.submitButtonText}>
                                    Save Changes
                                </Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={[
                                    styles.submitButton,
                                    {
                                        backgroundColor: "#FF5252",
                                        marginTop: 12,
                                    },
                                ]}
                                onPress={() => {
                                    Alert.alert(
                                        "ยืนยันการลบ",
                                        "คุณแน่ใจหรือไม่ว่าต้องการลบชุดการ์ดนี้? ข้อมูลทั้งหมดจะหายไป",
                                        [
                                            { text: "ยกเลิก", style: "cancel" },
                                            {
                                                text: "ลบ",
                                                style: "destructive",
                                                onPress: () => {
                                                    deleteDeck(selectedDeck.id);
                                                    setIsEditModalVisible(
                                                        false,
                                                    );
                                                },
                                            },
                                        ],
                                    );
                                }}
                            >
                                <Text style={styles.submitButtonText}>
                                    Delete Deck
                                </Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </KeyboardAvoidingView>
            </Modal>

            <Modal
                visible={isAddCardModalVisible}
                transparent={true}
                animationType="fade"
            >
                <KeyboardAvoidingView
                    behavior={Platform.OS === "ios" ? "padding" : "height"}
                    style={styles.modalOverlay}
                >
                    <View
                        style={[
                            styles.modalContent,
                            theme === "dark" && styles.modalContentDark,
                        ]}
                    >
                        <View style={styles.modalHeader}>
                            <Text
                                style={[
                                    styles.modalTitle,
                                    theme === "dark" && styles.modalTitleDark,
                                ]}
                            >
                                Add New Card
                            </Text>
                            <TouchableOpacity
                                onPress={() => setIsAddCardModalVisible(false)}
                            >
                                <Ionicons
                                    name="close"
                                    size={24}
                                    color={theme === "light" ? "#666" : "#AAA"}
                                />
                            </TouchableOpacity>
                        </View>

                        <View style={styles.form}>
                            <Text
                                style={[
                                    styles.label,
                                    theme === "dark" && styles.labelDark,
                                ]}
                            >
                                Word/Front
                            </Text>
                            <TextInput
                                style={[
                                    styles.input,
                                    theme === "dark" && styles.inputDark,
                                ]}
                                placeholder="Enter word..."
                                placeholderTextColor={
                                    theme === "light" ? "#999" : "#666"
                                }
                                value={newCardFront}
                                onChangeText={setNewCardFront}
                            />

                            <Text
                                style={[
                                    styles.label,
                                    theme === "dark" && styles.labelDark,
                                ]}
                            >
                                Meaning/Back
                            </Text>
                            <TextInput
                                style={[
                                    styles.input,
                                    theme === "dark" && styles.inputDark,
                                ]}
                                placeholder="Enter meaning..."
                                placeholderTextColor={
                                    theme === "light" ? "#999" : "#666"
                                }
                                value={newCardBack}
                                onChangeText={setNewCardBack}
                            />

                            <TouchableOpacity
                                style={[
                                    styles.submitButton,
                                    isAddingCard && { opacity: 0.7 },
                                ]}
                                onPress={handleAddCard}
                                disabled={isAddingCard}
                            >
                                <Text style={styles.submitButtonText}>
                                    {isAddingCard ? "Saving..." : "Save Card"}
                                </Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </KeyboardAvoidingView>
            </Modal>

            <Modal
                visible={isModalVisible}
                transparent={true}
                animationType="fade"
            >
                <KeyboardAvoidingView
                    behavior={Platform.OS === "ios" ? "padding" : "height"}
                    style={styles.modalOverlay}
                >
                    <View
                        style={[
                            styles.modalContent,
                            theme === "dark" && styles.modalContentDark,
                        ]}
                    >
                        <View style={styles.modalHeader}>
                            <Text
                                style={[
                                    styles.modalTitle,
                                    theme === "dark" && styles.modalTitleDark,
                                ]}
                            >
                                Add New Deck
                            </Text>
                            <TouchableOpacity
                                onPress={() => setIsModalVisible(false)}
                            >
                                <Ionicons
                                    name="close"
                                    size={24}
                                    color={theme === "light" ? "#666" : "#AAA"}
                                />
                            </TouchableOpacity>
                        </View>

                        <View style={styles.form}>
                            <Text
                                style={[
                                    styles.label,
                                    theme === "dark" && styles.labelDark,
                                ]}
                            >
                                Deck Name
                            </Text>
                            <TextInput
                                style={[
                                    styles.input,
                                    theme === "dark" && styles.inputDark,
                                ]}
                                placeholder="Enter deck name..."
                                placeholderTextColor={
                                    theme === "light" ? "#999" : "#666"
                                }
                                value={deckName}
                                onChangeText={setDeckName}
                            />

                            <Text
                                style={[
                                    styles.label,
                                    theme === "dark" && styles.labelDark,
                                ]}
                            >
                                Daily Goal (Words)
                            </Text>
                            <TextInput
                                style={[
                                    styles.input,
                                    theme === "dark" && styles.inputDark,
                                ]}
                                placeholder="e.g. 5"
                                placeholderTextColor={
                                    theme === "light" ? "#999" : "#666"
                                }
                                keyboardType="numeric"
                                value={dailyGoal}
                                onChangeText={setDailyGoal}
                            />

                            <Text
                                style={[
                                    styles.label,
                                    theme === "dark" && styles.labelDark,
                                ]}
                            >
                                Notion Token
                            </Text>
                            <TextInput
                                style={[
                                    styles.input,
                                    theme === "dark" && styles.inputDark,
                                ]}
                                placeholder="secret_xxxxxxxxxxxx"
                                placeholderTextColor={
                                    theme === "light" ? "#999" : "#666"
                                }
                                value={apiToken}
                                onChangeText={setApiToken}
                                secureTextEntry={true}
                            />

                            <TouchableOpacity
                                style={styles.submitButton}
                                onPress={handleAddDeck}
                            >
                                <Text style={styles.submitButtonText}>
                                    Save Deck
                                </Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </KeyboardAvoidingView>
            </Modal>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: "#FFFFFF",
    },
    containerDark: {
        backgroundColor: "#000000",
    },
    header: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        paddingHorizontal: 24,
        paddingTop: 60,
        paddingBottom: 30,
    },
    title: {
        fontSize: 40,
        fontWeight: "800",
        color: "#000000",
        letterSpacing: -1.5,
    },
    titleDark: {
        color: "#FFFFFF",
    },
    themeButton: {
        padding: 12,
        borderRadius: 16,
        backgroundColor: "transparent",
    },
    addButton: {
        backgroundColor: "#000000",
        width: 56,
        height: 56,
        borderRadius: 20,
        alignItems: "center",
        justifyContent: "center",
        elevation: 4,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.1,
        shadowRadius: 12,
    },
    listContent: {
        padding: 24,
        paddingBottom: 40,
    },
    deckItem: {
        flexDirection: "row",
        alignItems: "center",
        backgroundColor: "#F8F9FA",
        padding: 20,
        borderRadius: 24,
        marginBottom: 16,
        borderWidth: 1,
        borderColor: "transparent",
    },
    deckItemDark: {
        backgroundColor: "#1C1C1E",
        borderColor: "#2C2C2E",
    },
    textContainer: {
        flex: 1,
    },
    deckTitle: {
        fontSize: 22,
        fontWeight: "700",
        color: "#000000",
        marginBottom: 4,
    },
    textDark: {
        color: "#FFFFFF",
    },
    deckDetails: {
        fontSize: 15,
        color: "#666666",
    },
    detailsRow: {
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
        flexWrap: "wrap",
    },
    goalBadge: {
        backgroundColor: "#E8E8E8",
        paddingHorizontal: 6,
        paddingVertical: 2,
        borderRadius: 4,
    },
    goalBadgeDark: {
        backgroundColor: "#2C2C2E",
    },
    goalText: {
        fontSize: 12,
        fontWeight: "600",
        color: "#333",
    },
    goalTextDark: {
        color: "#AAA",
    },
    textDarkDetails: {
        color: "#8E8E93",
    },
    actionContainer: {
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
    },
    deleteButton: {
        padding: 12,
    },
    addCardButton: {
        padding: 12,
    },
    editButton: {
        padding: 12,
    },
    iconAction: {
        padding: 10,
        borderRadius: 12,
        backgroundColor: "transparent",
    },
    studyButton: {
        paddingHorizontal: 20,
        paddingVertical: 12,
        borderRadius: 16,
    },
    studyButtonText: {
        color: "white",
        fontSize: 16,
        fontWeight: "600",
    },
    emptyContainer: {
        flex: 1,
        alignItems: "center",
        justifyContent: "center",
        marginTop: 100,
    },
    emptyText: {
        textAlign: "center",
        fontSize: 18,
        color: "#999999",
        marginTop: 16,
        lineHeight: 26,
        fontWeight: "500",
    },
    emptyTextDark: {
        color: "#666666",
    },
    modalOverlay: {
        flex: 1,
        backgroundColor: "rgba(0,0,0,0.7)",
        justifyContent: "center",
        alignItems: "center",
        padding: 24,
    },
    modalContent: {
        backgroundColor: "white",
        width: "100%",
        borderRadius: 32,
        padding: 32,
        borderWidth: 1,
        borderColor: "#EEE",
    },
    modalContentDark: {
        backgroundColor: "#1C1C1E",
        borderColor: "#3A3A3C",
    },
    modalHeader: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        marginBottom: 28,
    },
    modalTitle: {
        fontSize: 28,
        fontWeight: "800",
        color: "#000000",
        letterSpacing: -0.5,
    },
    modalTitleDark: {
        color: "#FFFFFF",
    },
    form: {
        gap: 20,
    },
    label: {
        fontSize: 15,
        fontWeight: "600",
        color: "#666666",
        marginBottom: 8,
    },
    labelDark: {
        color: "#8E8E93",
    },
    input: {
        backgroundColor: "#F2F2F7",
        paddingHorizontal: 16,
        paddingVertical: 16,
        borderRadius: 16,
        fontSize: 18,
        color: "#000000",
        borderWidth: 1,
        borderColor: "transparent",
    },
    inputDark: {
        backgroundColor: "#2C2C2E",
        color: "#FFFFFF",
        borderColor: "#3A3A3C",
    },
    submitButton: {
        backgroundColor: "#007AFF",
        paddingVertical: 18,
        borderRadius: 18,
        alignItems: "center",
        marginTop: 12,
    },
    submitButtonText: {
        color: "white",
        fontSize: 18,
        fontWeight: "700",
    },
});
