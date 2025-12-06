# main.py

from datetime import datetime, timedelta

from models import Client, PropertyListing, MediaPackage
from booking_manager import BookingManager


def demo():
    print("=== Real Estate Media Booking Demo ===")

    # Example client & property
    client = Client(name="Jamie Agent", email="jamie@example.com", phone="555-1234")
    property_listing = PropertyListing(
        address="123 Maple Street",
        city="Cedar City",
        state="UT",
        square_feet=2200,
    )

    # Example packages
    photo_only = MediaPackage(name="Listing Photos", price=150.0)
    full_package = MediaPackage(
        name="Photo + Video + Drone",
        price=400.0,
        includes_video=True,
        includes_drone=True,
    )

    manager = BookingManager()

    # Schedule two shoots in the future
    tomorrow_10am = datetime.now() + timedelta(days=1, hours=2)
    next_week_3pm = datetime.now() + timedelta(days=7, hours=3)

    booking1 = manager.create_booking(
        client=client,
        property_listing=property_listing,
        media_package=photo_only,
        scheduled_for=tomorrow_10am,
        notes="Standard MLS photos.",
    )

    booking2 = manager.create_booking(
        client=client,
        property_listing=property_listing,
        media_package=full_package,
        scheduled_for=next_week_3pm,
        notes="Full package for marketing campaign.",
    )

    print("\nCreated bookings:")
    print("-", booking1.summary())
    print("-", booking2.summary())

    print("\nAll bookings for", client.email)
    for b in manager.find_bookings_for_client(client.email):
        print("•", b.summary())

    print("\nTotal bookings stored in manager:", len(manager.bookings))


if __name__ == "__main__":
    demo()
