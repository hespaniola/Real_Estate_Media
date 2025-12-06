
import unittest
from datetime import datetime, timedelta

from models import Client, PropertyListing, MediaPackage, Booking
from booking_manager import BookingManager


class TestModels(unittest.TestCase):
    def test_client_email_validation(self):
        with self.assertRaises(ValueError):
            Client(name="Bad Email", email="not-an-email")

    def test_property_square_feet_validation(self):
        with self.assertRaises(ValueError):
            PropertyListing(address="1 Test", city="City", state="ST", square_feet=0)

    def test_booking_cannot_be_in_past(self):
        client = Client(name="Test", email="test@example.com")
        prop = PropertyListing(address="1 Test", city="City", state="ST", square_feet=1000)
        pkg = MediaPackage(name="Test Package", price=100.0)
        past_time = datetime.now() - timedelta(days=1)

        with self.assertRaises(ValueError):
            Booking(client=client, property_listing=prop, media_package=pkg, scheduled_for=past_time)


class TestBookingManager(unittest.TestCase):
    def setUp(self):
        self.manager = BookingManager()
        self.manager.clear()

        self.client = Client(name="Jamie Agent", email="jamie@example.com")
        self.property = PropertyListing(
            address="123 Maple",
            city="Cedar City",
            state="UT",
            square_feet=2200,
        )
        self.pkg = MediaPackage(name="Listing Photos", price=150.0)

    def test_singleton_instance(self):
        other = BookingManager()
        self.assertIs(self.manager, other, "BookingManager should be a singleton.")

    def test_create_booking(self):
        time = datetime.now() + timedelta(days=1)
        booking = self.manager.create_booking(
            client=self.client,
            property_listing=self.property,
            media_package=self.pkg,
            scheduled_for=time,
        )

        self.assertEqual(len(self.manager.bookings), 1)
        self.assertEqual(self.manager.bookings[0], booking)

    def test_find_bookings_for_client(self):
        time = datetime.now() + timedelta(days=1)
        self.manager.create_booking(
            client=self.client,
            property_listing=self.property,
            media_package=self.pkg,
            scheduled_for=time,
        )

        result = self.manager.find_bookings_for_client("jamie@example.com")
        self.assertEqual(len(result), 1)
        self.assertEqual(result[0].client.email, "jamie@example.com")


if __name__ == "__main__":
    unittest.main()
