import SwiftUI
import UIKit

struct GymsView: View {
    @EnvironmentObject private var store: WorkoutStore
    @State private var draft: Gym?
    @State private var deleting: Gym?
    @State private var search = ""
    @State private var busy = false
    @State private var error: String?

    private var visibleGyms: [Gym] {
        store.gyms.filter { gym in
            search.isEmpty || ([gym.name] + gym.equipment.map(\.name)).joined(separator: " ").localizedCaseInsensitiveContains(search)
        }.sorted { $0.name.localizedStandardCompare($1.name) == .orderedAscending }
    }

    var body: some View {
        List {
            Section {
                Text("Record what’s available. Assign routines to a gym and share its equipment with AI when planning workouts.")
                    .foregroundStyle(Theme.muted)
            }
            if store.gyms.isEmpty {
                ContentUnavailableView {
                    Label("Every gym is different", systemImage: "building.2")
                } description: {
                    Text("Add your gym, home setup, or hotel fitness room.")
                } actions: {
                    Button("Create your first gym") { draft = Gym() }
                }
            } else {
                ForEach(visibleGyms) { gym in
                    Section {
                        NavigationLink {
                            GymDetailView(gymID: gym.id)
                        } label: {
                            VStack(alignment: .leading, spacing: 5) {
                                Label(gym.name, systemImage: "building.2")
                                    .font(.headline)
                                Text("\(gym.equipment.count) equipment entries · \(store.templates.filter { $0.gymId == gym.id }.count) routines")
                                    .font(.caption).foregroundStyle(Theme.muted)
                            }
                        }
                        .swipeActions {
                            Button("Delete", role: .destructive) { deleting = gym }
                            Button("Edit") { draft = gym }.tint(Theme.accent)
                        }
                    }
                }
                if visibleGyms.isEmpty { Text("No gyms match your search.") }
            }
        }
        .navigationTitle("Gyms")
        .searchable(text: $search, prompt: "Search gyms or equipment")
        .toolbar { ToolbarItem(placement: .topBarTrailing) { Button("Add gym", systemImage: "plus") { draft = Gym() }.disabled(busy) } }
        .refreshable { await store.loadData() }
        .sheet(item: $draft) { GymEditor(gym: $0) }
        .alert("Delete \(deleting?.name ?? "gym")?", isPresented: Binding(get: { deleting != nil }, set: { if !$0 { deleting = nil } })) {
            Button("Cancel", role: .cancel) { deleting = nil }
            Button("Delete gym", role: .destructive) {
                guard let gym = deleting else { return }
                Task {
                    busy = true
                    defer { busy = false; deleting = nil }
                    do { try await store.deleteGym(gym.id) }
                    catch { self.error = error.localizedDescription }
                }
            }
        } message: { Text("This removes the gym and its equipment. Routines must be reassigned or unassigned first.") }
        .alert("Could not delete gym", isPresented: Binding(get: { error != nil }, set: { if !$0 { error = nil } })) {
            Button("OK") { error = nil }
        } message: { Text(error ?? "") }
    }
}

private struct GymDetailView: View {
    @EnvironmentObject private var store: WorkoutStore
    let gymID: String
    @State private var editing: Gym?
    @State private var showingBrief = false

    var body: some View {
        if let gym = store.gyms.first(where: { $0.id == gymID }) {
            List {
                if !gym.notes.isEmpty { Section("Gym notes") { Text(gym.notes) } }
                Section {
                    Button("Build with AI", systemImage: "sparkles") { showingBrief = true }
                } footer: { Text("Review and share this gym’s equipment with ChatGPT or another AI conversation.") }
                ForEach(GymEquipment.categories, id: \.self) { category in
                    let items = gym.equipment.filter { $0.category == category }
                    if !items.isEmpty {
                        Section(category) {
                            ForEach(items) { item in
                                VStack(alignment: .leading, spacing: 4) {
                                    Text(item.name).font(.headline)
                                    if !item.details.isEmpty { Text(item.details).font(.subheadline).foregroundStyle(Theme.muted) }
                                }
                            }
                        }
                    }
                }
                if gym.equipment.isEmpty { Text("No equipment recorded yet. Edit this gym to add it.").foregroundStyle(Theme.muted) }
                Section("Routines at this gym") {
                    let routines = store.templates.filter { $0.gymId == gym.id }
                    if routines.isEmpty { Text("Choose this gym when editing a routine.").foregroundStyle(Theme.muted) }
                    ForEach(routines) { Text($0.name) }
                }
            }
            .navigationTitle(gym.name)
            .toolbar { Button("Edit") { editing = gym } }
            .sheet(item: $editing) { GymEditor(gym: $0) }
            .sheet(isPresented: $showingBrief) { GymBriefSheet(text: gym.aiBrief()) }
        } else { ContentUnavailableView("Gym unavailable", systemImage: "building.2") }
    }
}

private struct GymEditor: View {
    @EnvironmentObject private var store: WorkoutStore
    @Environment(\.dismiss) private var dismiss
    @State var gym: Gym
    @State private var busy = false
    @State private var error: String?

    var body: some View {
        NavigationStack {
            Form {
                Section("Gym") {
                    TextField("Gym name", text: $gym.name)
                    TextField("Gym notes", text: $gym.notes, axis: .vertical).lineLimit(2...5)
                }
                Section {
                    Menu("Add common equipment", systemImage: "plus") {
                        ForEach(GymEquipment.quickAdd, id: \.0) { name, category in
                            Button(name) { gym.equipment.append(GymEquipment(name: name, category: category)) }
                                .disabled(gym.equipment.contains { $0.name == name })
                        }
                    }.disabled(gym.equipment.count >= 200)
                    Button("Add custom equipment", systemImage: "plus") { gym.equipment.append(GymEquipment()) }
                        .disabled(gym.equipment.count >= 200)
                } header: { Text("Equipment") } footer: {
                    Text("Record confirmed equipment. Include units, weight ranges, machine models, and attachments in the details. Up to 200 entries.")
                }
                ForEach($gym.equipment) { $item in
                    Section {
                        TextField("Equipment name", text: $item.name)
                        Picker("Category", selection: $item.category) {
                            ForEach(GymEquipment.categories, id: \.self) { Text($0).tag($0) }
                        }
                        TextField("Details, e.g. 5–100 lb, 5 lb increments", text: $item.details, axis: .vertical).lineLimit(2...5)
                        Button("Remove equipment", role: .destructive) { gym.equipment.removeAll { $0.id == item.id } }
                    }
                }
                if !gym.isValid {
                    Section { Text("Add a gym name and a name for every equipment entry. Names allow 120 characters, equipment details 500, and gym notes 2,000.").font(.footnote).foregroundStyle(Theme.muted) }
                }
                if let error { Section { Text(error).foregroundStyle(Theme.danger) } }
            }
            .disabled(busy)
            .navigationTitle(store.gyms.contains { $0.id == gym.id } ? "Edit gym" : "New gym")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() }.disabled(busy) }
                ToolbarItem(placement: .confirmationAction) {
                    Button(busy ? "Saving…" : "Save") {
                        Task {
                            busy = true; error = nil
                            defer { busy = false }
                            do { try await store.saveGym(gym); dismiss() }
                            catch { self.error = error.localizedDescription }
                        }
                    }.disabled(busy || !gym.isValid)
                }
            }
            .interactiveDismissDisabled(busy)
        }
    }
}

struct GymBriefSheet: View {
    @Environment(\.dismiss) private var dismiss
    let text: String
    @State private var copied = false
    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    Text("Review this brief, then paste or share it into your AI conversation.").foregroundStyle(Theme.muted)
                    HStack {
                        Button(copied ? "Copied" : "Copy brief", systemImage: "doc.on.doc") { UIPasteboard.general.string = text; copied = true }
                        Spacer()
                        ShareLink(item: text)
                    }
                    Text(text).font(.body.monospaced()).textSelection(.enabled)
                }.padding()
            }
            .navigationTitle("Build with AI")
            .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Done") { dismiss() } } }
        }
    }
}

struct ExerciseEquipmentPicker: View {
    @EnvironmentObject private var store: WorkoutStore
    @Binding var exercise: Exercise

    private var refs: [EquipmentAlternative] { exercise.equipmentAlternatives ?? [] }
    private var missing: [EquipmentAlternative] {
        refs.filter { ref in !store.gyms.contains { gym in gym.id == ref.gymId && gym.equipment.contains { $0.id == ref.equipmentId } } }
    }

    var body: some View {
        if store.gyms.allSatisfy({ $0.equipment.isEmpty }) {
            Text("Add equipment in Gyms to associate it with this exercise.").foregroundStyle(Theme.muted)
        }
        NavigationLink("Manage gyms & equipment") { GymsView() }
        ForEach(store.gyms) { gym in
            ForEach(gym.equipment) { item in
                let ref = EquipmentAlternative(gymId: gym.id, equipmentId: item.id)
                Toggle("\(gym.name) · \(item.name)", isOn: Binding(
                    get: { refs.contains(ref) },
                    set: { selected in
                        exercise.equipmentAlternatives = selected ? refs + [ref] : refs.filter { $0 != ref }
                    }
                )).disabled(!refs.contains(ref) && refs.count >= 100)
            }
        }
        ForEach(missing) { ref in
            Button("Remove unavailable equipment (\(ref.gymId) / \(ref.equipmentId))", role: .destructive) {
                exercise.equipmentAlternatives = refs.filter { $0 != ref }
            }
        }
    }
}
