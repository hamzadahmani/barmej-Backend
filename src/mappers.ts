import {Place, User} from '@prisma/client';

type PlaceWithCategories = Place & {categories?: Array<{categoryId: number}>};

export const userDto = (u: User) => ({
  idUser: u.id,
  userMail: u.email,
  firstName: u.firstName,
  lastName: u.lastName,
  userName: u.firstName,
  userMobile: u.mobile,
  userGender: u.gender,
  userPhoto: u.photo,
  dateOfBirth: u.birthDate?.toISOString().slice(0, 10) ?? null,
  userRole: u.role.toLowerCase(),
  userLatitude: u.latitude,
  userLongtitude: u.longitude,
  dietaryPreferences: u.dietaryPreferences,
  allergies: u.allergies,
  favoriteAmbiences: u.favoriteAmbiences,
  preferredBudget: u.preferredBudget,
});

export const placeDto = (p: PlaceWithCategories) => ({
  idPlace: p.id,
  idCategory: p.categoryId,
  categoryIds: p.categories?.map(item => item.categoryId) ?? [p.categoryId],
  placeName: p.name,
  subTitle: p.subtitle,
  image: p.image,
  latitude: p.latitude,
  longitude: p.longitude,
  horaire: p.schedule,
  placeTel: p.phone,
  placeAdress: p.address,
  placeMail: p.email,
  placeDescription: p.description,
  placeOutfit: p.outfit,
  placeMusicStyle: p.musicStyle,
  placeHappyHour: p.happyHour,
  placeFavorableDay: p.favorableDay,
  placeFavorableHour: p.favorableHour,
  averagePrice: p.averagePrice,
  capacityPerSlot: p.capacityPerSlot,
  verified: p.verified,
  reviewsEnabled: p.reviewsEnabled,
  cuisineType: p.cuisineType,
  ambienceTags: p.ambienceTags,
});

export const placeInfoDto = (p: Place) => ({
  placeTel: p.phone,
  placeAdress: p.address,
  placeMail: p.email,
  placeDescription: p.description,
  placeOutfit: p.outfit,
  placeMusicStyle: p.musicStyle,
  placeHappyHour: p.happyHour,
  horaire: p.schedule,
  placeFavorableDay: p.favorableDay,
  placeFavorableHour: p.favorableHour,
});
