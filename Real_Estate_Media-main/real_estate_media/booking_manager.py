
from typing import List
from datetime import datetime

from models import Client, PropertyListing, MediaPackage, Booking


class BookingManager:
    """
    Singleton that manages all bookings for the real estate media system.
    """

    _instance = None

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super(BookingManager, cls).__new__(cls)
            cls._instance._bookings = []
        return cls._instance

    @property
    def bookings(self) -> List[Booking]:
        return list(self._bookings)

    def create_booking(
        self,
        client: Client,
        property_listing: PropertyListing,
        media_package: MediaPackage,
        scheduled_for: datetime,
        notes: str = "",
    ) -> Booking:
        booking = Booking(
            client=client,
            property_listing=property_listing,
            media_package=media_package,
            scheduled_for=scheduled_for,
            notes=notes,
        )
        self._bookings.append(booking)
        return booking

    def find_bookings_for_client(self, email: str) -> List[Booking]:
        return [b for b in self._bookings if b.client.email == email]

    def clear(self):
        """Helper for tests: clear all bookings."""
        self._bookings.clear()
