import SwiftUI

extension Notification.Name {
    static let keyboardDoneToolbarDismissed = Notification.Name("keyboardDoneToolbarDismissed")
    static let workoutInputFocusDismissed = Notification.Name("workoutInputFocusDismissed")
}

enum Theme {
    // Shared Macrovana companion palette: cool surfaces and a restrained cyan accent.
    static let accent = Color(red: 0, green: 0.812, blue: 1)
    static let accentDark = Color(red: 0, green: 0.65, blue: 0.83)
    static let accentLight = Color(red: 0.35, green: 0.88, blue: 1)
    static let success = Color(red: 0.07, green: 0.54, blue: 0.41)
    static let warning = Color(red: 0.85, green: 0.54, blue: 0.09)
    static let danger = Color(red: 0.81, green: 0.25, blue: 0.28)

    static let background = Color(UIColor { traits in
        traits.userInterfaceStyle == .dark
            ? UIColor(red: 0.027, green: 0.035, blue: 0.059, alpha: 1)
            : UIColor(red: 0.953, green: 0.965, blue: 0.980, alpha: 1)
    })

    static let surface = Color(UIColor { traits in
        traits.userInterfaceStyle == .dark
            ? UIColor(red: 0.051, green: 0.067, blue: 0.118, alpha: 1)
            : UIColor.white
    })

    static let surface2 = Color(UIColor { traits in
        traits.userInterfaceStyle == .dark
            ? UIColor(red: 0.071, green: 0.094, blue: 0.157, alpha: 1)
            : UIColor(red: 0.91, green: 0.94, blue: 0.97, alpha: 1)
    })

    static let border = Color(UIColor { traits in
        traits.userInterfaceStyle == .dark
            ? UIColor(red: 0.15, green: 0.19, blue: 0.27, alpha: 1)
            : UIColor(red: 0.83, green: 0.87, blue: 0.92, alpha: 1)
    })

    static let text = Color(UIColor { traits in
        traits.userInterfaceStyle == .dark
            ? UIColor(red: 0.953, green: 0.969, blue: 0.984, alpha: 1)
            : UIColor(red: 0.08, green: 0.12, blue: 0.2, alpha: 1)
    })

    static let muted = Color(UIColor { traits in
        traits.userInterfaceStyle == .dark
            ? UIColor(red: 0.65, green: 0.70, blue: 0.78, alpha: 1)
            : UIColor(red: 0.32, green: 0.4, blue: 0.5, alpha: 1)
    })

    static let radius: CGFloat = 14
}

struct PrimaryButtonStyle: ButtonStyle {
    var compact = false

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.system(size: compact ? 13 : 15, weight: .bold))
            .foregroundStyle(Color(red: 0.025, green: 0.06, blue: 0.10))
            .padding(.horizontal, compact ? 12 : 16)
            .padding(.vertical, compact ? 9 : 12)
            .background(configuration.isPressed ? Theme.accentDark : Theme.accent)
            .clipShape(RoundedRectangle(cornerRadius: Theme.radius, style: .continuous))
            .scaleEffect(configuration.isPressed ? 0.97 : 1)
            .shadow(color: .clear, radius: 0)
    }
}

struct SecondaryButtonStyle: ButtonStyle {
    var compact = false

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.system(size: compact ? 13 : 14, weight: .semibold))
            .foregroundStyle(Theme.text)
            .padding(.horizontal, compact ? 12 : 16)
            .padding(.vertical, compact ? 9 : 12)
            .background(Theme.surface)
            .overlay(
                RoundedRectangle(cornerRadius: Theme.radius, style: .continuous)
                    .stroke(Theme.border, lineWidth: 1)
            )
            .clipShape(RoundedRectangle(cornerRadius: Theme.radius, style: .continuous))
            .scaleEffect(configuration.isPressed ? 0.97 : 1)
    }
}

struct DangerButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.system(size: 14, weight: .semibold))
            .foregroundStyle(Theme.danger)
            .padding(.horizontal, 16)
            .padding(.vertical, 10)
            .background(Theme.surface)
            .overlay(
                RoundedRectangle(cornerRadius: Theme.radius, style: .continuous)
                    .stroke(Theme.danger, lineWidth: 1)
            )
            .clipShape(RoundedRectangle(cornerRadius: Theme.radius, style: .continuous))
            .scaleEffect(configuration.isPressed ? 0.97 : 1)
    }
}

struct KeyboardDoneToolbar: View {
    let action: () -> Void

    var body: some View {
        Button {
            action()
            NotificationCenter.default.post(name: .keyboardDoneToolbarDismissed, object: nil)
            NotificationCenter.default.post(name: .workoutInputFocusDismissed, object: nil)
            UIApplication.shared.sendAction(#selector(UIResponder.resignFirstResponder), to: nil, from: nil, for: nil)
        } label: {
            HStack {
                Spacer(minLength: 0)
                Text("Done")
                    .font(.system(size: 17, weight: .semibold))
                    .foregroundStyle(Theme.accent)
                    .padding(.trailing, 20)
            }
            .frame(width: UIScreen.main.bounds.width, height: 44, alignment: .trailing)
            .background(toolbarBackground)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Done")
    }

    private var toolbarBackground: Color {
        Color(UIColor { traits in
            traits.userInterfaceStyle == .dark
                ? UIColor(red: 0.20, green: 0.20, blue: 0.22, alpha: 1)
                : UIColor(red: 0.86, green: 0.86, blue: 0.88, alpha: 1)
        })
    }
}

struct IconCircleButton: View {
    let systemName: String
    var tint: Color = Theme.text
    var disabled = false
    var size: CGFloat = 32
    var iconSize: CGFloat = 14
    var borderTint: Color = Theme.border
    var borderLineWidth: CGFloat = 1
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Image(systemName: systemName)
                .font(.system(size: iconSize, weight: .semibold))
                .foregroundStyle(disabled ? Theme.muted.opacity(0.4) : tint)
                .frame(width: size, height: size)
                .background(Theme.surface)
                .overlay(Circle().stroke(borderTint, lineWidth: borderLineWidth))
                .clipShape(Circle())
        }
        .disabled(disabled)
    }
}

struct ToolbarCircleActionButton: View {
    let systemName: String
    let accessibilityLabel: String
    var tint: Color = Theme.accent
    var disabled = false
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Image(systemName: systemName)
                .font(.system(size: 17, weight: .bold))
                .foregroundStyle(disabled ? Theme.muted.opacity(0.4) : tint)
                .frame(width: 34, height: 34)
                .contentShape(Circle())
                .toolbarGlass(in: Circle(), tint: disabled ? nil : tint.opacity(0.08))
        }
        .buttonStyle(.plain)
        .disabled(disabled)
        .accessibilityLabel(accessibilityLabel)
    }
}

struct Card<Content: View>: View {
    @ViewBuilder var content: Content

    var body: some View {
        content
            .padding(16)
            .background(Theme.surface)
            .overlay(
                RoundedRectangle(cornerRadius: Theme.radius, style: .continuous)
                    .stroke(Theme.border, lineWidth: 1)
            )
            .clipShape(RoundedRectangle(cornerRadius: Theme.radius, style: .continuous))
            .shadow(color: .black.opacity(0.07), radius: 10, x: 0, y: 4)
    }
}

struct Badge: View {
    let text: String
    var icon: String?
    var accent = false

    var body: some View {
        HStack(spacing: 4) {
            if let icon {
                Image(systemName: icon)
                    .font(.system(size: 10, weight: .bold))
            }
            Text(text)
                .font(.system(size: 10, weight: .bold))
                .textCase(.uppercase)
                .lineLimit(2)
                .multilineTextAlignment(.leading)
        }
        .foregroundStyle(accent ? Theme.accent : Theme.muted)
        .padding(.horizontal, 8)
        .padding(.vertical, 4)
        .background(accent ? Theme.accent.opacity(0.1) : Theme.surface2)
        .clipShape(Capsule())
        .fixedSize(horizontal: false, vertical: true)
    }
}

struct FormLabel: View {
    let text: String

    var body: some View {
        Text(text)
            .font(.system(size: 12, weight: .semibold))
            .foregroundStyle(Theme.muted)
    }
}

struct EmptyState: View {
    let icon: String
    let text: String

    var body: some View {
        VStack(spacing: 10) {
            Image(systemName: icon)
                .font(.system(size: 34, weight: .regular))
                .foregroundStyle(Theme.border)
            Text(text)
                .font(.system(size: 13, weight: .semibold))
                .foregroundStyle(Theme.muted)
                .multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 30)
    }
}

struct FieldBackground: ViewModifier {
    func body(content: Content) -> some View {
        content
            .font(.system(size: 15))
            .foregroundStyle(Theme.text)
            .padding(.horizontal, 12)
            .frame(minHeight: 44)
            .background(Theme.surface)
            .overlay(
                RoundedRectangle(cornerRadius: Theme.radius, style: .continuous)
                    .stroke(Theme.border, lineWidth: 1)
            )
            .clipShape(RoundedRectangle(cornerRadius: Theme.radius, style: .continuous))
    }
}

extension View {
    func fieldStyle() -> some View {
        modifier(FieldBackground())
    }

    @ViewBuilder
    func toolbarGlass<S: Shape>(in shape: S, tint: Color? = nil, interactive: Bool = true) -> some View {
        if #available(iOS 26.0, *) {
            glassEffect(.regular.tint(tint).interactive(interactive), in: shape)
        } else {
            background(.regularMaterial, in: shape)
                .overlay(shape.stroke(Theme.border.opacity(0.7), lineWidth: 1))
        }
    }
}
