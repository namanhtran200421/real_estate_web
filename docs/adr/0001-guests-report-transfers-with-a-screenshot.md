# Guests report their transfer with a screenshot

Migration 010 stopped asking guests to report their transfer: they scanned the VietQR code and the owner watched the bank app for the money. We now ask for the opposite. After transferring, the guest must attach a **transfer screenshot** and press "Tiếp tục thanh toán", which creates a **reported transfer** for the owner to verify or reject.

We chose this because guests expect it from Vietnamese booking apps (Alobo and similar), it gives the owner a concrete thing to check instead of watching the bank app for every unpaid booking, and the screenshot settles "I paid, you didn't see it" disputes. The site still cannot see the bank account, so a screenshot is evidence, not proof: the booking is only confirmed when the owner verifies the money in the bank app.

## Consequences

- Reporting lifts the hold. The dates stay blocked until the owner verifies or rejects, however long that takes.
- The screenshot is fixed once sent. A rejected report gives the guest a new hold, and a new report needs a new screenshot.
- The owner can still record money that arrived without a report (cash, or a guest who never pressed the button), as before.
