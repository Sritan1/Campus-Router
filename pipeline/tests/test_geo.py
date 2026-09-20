import math

import pytest

from pipeline.geo import EARTH_RADIUS_M, haversine_m


def test_same_point_is_zero():
    assert haversine_m(41.87, -87.65, 41.87, -87.65) == 0.0


def test_one_degree_of_latitude():
    # one degree of latitude is the same everywhere, so check it against the radius
    expected = EARTH_RADIUS_M * math.radians(1.0)
    assert haversine_m(0.0, 0.0, 1.0, 0.0) == pytest.approx(expected)


def test_longitude_shrinks_as_you_go_north():
    at_equator = haversine_m(0.0, 0.0, 0.0, 1.0)
    at_chicago = haversine_m(41.87, 0.0, 41.87, 1.0)
    assert at_chicago < at_equator

    # cosine of the latitude is the shrink factor
    shrunk = at_equator * math.cos(math.radians(41.87))
    assert at_chicago == pytest.approx(shrunk, rel=1e-3)


def test_known_campus_distance():
    metres = haversine_m(41.8708, -87.6505, 41.8717, -87.6505)
    assert 95 < metres < 105


def test_order_does_not_matter():
    there = haversine_m(41.87, -87.65, 41.88, -87.64)
    back = haversine_m(41.88, -87.64, 41.87, -87.65)
    assert there == pytest.approx(back)
