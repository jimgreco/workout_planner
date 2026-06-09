import SwiftUI

enum Theme {
    static let accent = Color(red: 1.0, green: 0.22, blue: 0.36)
    static let accentDark = Color(red: 0.89, green: 0.11, blue: 0.37)
    static let success = Color(red: 0.0, green: 0.52, blue: 0.54)
    static let warning = Color(red: 1.0, green: 0.71, blue: 0.0)
    static let danger = Color(red: 1.0, green: 0.22, blue: 0.36)

    static let background = Color(UIColor { traits in
        traits.userInterfaceStyle == .dark
            ? UIColor(red: 0.059, green: 0.059, blue: 0.075, alpha: 1)
            : UIColor.white
    })

    static let surface = Color(UIColor { traits in
        traits.userInterfaceStyle == .dark
            ? UIColor(red: 0.102, green: 0.102, blue: 0.141, alpha: 1)
            : UIColor(red: 0.969, green: 0.969, blue: 0.969, alpha: 1)
    })

    static let surface2 = Color(UIColor { traits in
        traits.userInterfaceStyle == .dark
            ? UIColor(red: 0.141, green: 0.141, blue: 0.2, alpha: 1)
            : UIColor(red: 0.922, green: 0.922, blue: 0.922, alpha: 1)
    })

    static let border = Color(UIColor { traits in
        traits.userInterfaceStyle == .dark
            ? UIColor(red: 0.18, green: 0.18, blue: 0.26, alpha: 1)
            : UIColor(red: 0.867, green: 0.867, blue: 0.867, alpha: 1)
    })

    static let text = Color(UIColor { traits in
        traits.userInterfaceStyle == .dark
            ? UIColor(red: 0.91, green: 0.91, blue: 0.94, alpha: 1)
            : UIColor(red: 0.133, green: 0.133, blue: 0.133, alpha: 1)
    })

    static let muted = Color(UIColor { traits in
        traits.userInterfaceStyle == .dark
            ? UIColor(red: 0.53, green: 0.53, blue: 0.6, alpha: 1)
            : UIColor(red: 0.443, green: 0.443, blue: 0.443, alpha: 1)
    })

    static let radius: CGFloat = 8
}

struct PrimaryButtonStyle: ButtonStyle {
    var compact = false

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.system(size: compact ? 13 : 14, weight: .semibold))
            .foregroundStyle(.white)
            .padding(.horizontal, compact ? 12 : 16)
            .padding(.vertical, compact ? 8 : 10)
            .background(configuration.isPressed ? Theme.accentDark : Theme.accent)
            .clipShape(RoundedRectangle(cornerRadius: Theme.radius, style: .continuous))
            .scaleEffect(configuration.isPressed ? 0.97 : 1)
    }
}

struct SecondaryButtonStyle: ButtonStyle {
    var compact = false

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.system(size: compact ? 13 : 14, weight: .semibold))
            .foregroundStyle(Theme.text)
            .padding(.horizontal, compact ? 12 : 16)
            .padding(.vertical, compact ? 8 : 10)
            .background(Theme.background)
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
            .background(Theme.background)
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
        Button(action: action) {
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
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Image(systemName: systemName)
                .font(.system(size: iconSize, weight: .semibold))
                .foregroundStyle(disabled ? Theme.muted.opacity(0.4) : tint)
                .frame(width: size, height: size)
                .background(Theme.background)
                .overlay(Circle().stroke(Theme.border, lineWidth: 1))
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
                .font(.system(size: 20, weight: .bold))
                .foregroundStyle(disabled ? Theme.muted.opacity(0.4) : tint)
                .frame(width: 42, height: 42)
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
            .background(Theme.background)
            .overlay(
                RoundedRectangle(cornerRadius: Theme.radius, style: .continuous)
                    .stroke(Theme.border, lineWidth: 1)
            )
            .clipShape(RoundedRectangle(cornerRadius: Theme.radius, style: .continuous))
            .shadow(color: .black.opacity(0.06), radius: 4, x: 0, y: 2)
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
        .clipShape(RoundedRectangle(cornerRadius: 4, style: .continuous))
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
        VStack(spacing: 12) {
            Image(systemName: icon)
                .font(.system(size: 44, weight: .regular))
                .foregroundStyle(Theme.border)
            Text(text)
                .font(.system(size: 14))
                .foregroundStyle(Theme.muted)
                .multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 44)
    }
}

struct FieldBackground: ViewModifier {
    func body(content: Content) -> some View {
        content
            .font(.system(size: 15))
            .foregroundStyle(Theme.text)
            .padding(.horizontal, 12)
            .frame(minHeight: 44)
            .background(Theme.background)
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
